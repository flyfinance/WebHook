// server.js
import "dotenv/config";
import express from "express";
import axios from "axios";
import cron from "node-cron";
import fs from "fs-extra";

const app = express();
app.use(express.json());

// 🔐 ENV
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || null;
const PORT = Number(process.env.PORT || 3000);
const TZ = process.env.TZ || "America/Sao_Paulo";

// 📄 storage
const FILE_PATH = "./pagamentos.json";
const SUBS_FILE = "./assinaturas.json"; // novo

async function garantirArquivoSubs() {
  if (!(await fs.pathExists(SUBS_FILE))) {
    await fs.writeJson(SUBS_FILE, { assinaturas: [] });
  }
}

async function registrarAssinatura(sub) {
  await garantirArquivoSubs();
  const dados = await fs.readJson(SUBS_FILE);
  dados.assinaturas.push(sub);
  await fs.writeJson(SUBS_FILE, dados);
}

// ========== helpers ==========
async function garantirArquivo() {
  if (!(await fs.pathExists(FILE_PATH))) {
    await fs.writeJson(FILE_PATH, { pagamentos: [], recorde: 0 });
  }
}

async function registrarPagamento(valor) {
  await garantirArquivo();
  const dados = await fs.readJson(FILE_PATH);
  dados.pagamentos.push({
    valor: Number(valor || 0),
    data: new Date().toISOString(),
  });
  await fs.writeJson(FILE_PATH, dados);
}

async function safeDiscord(content) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log("🔕 Sem DISCORD_WEBHOOK_URL. Pulando envio ao Discord.");
    return;
  }
  try {
    await axios.post(DISCORD_WEBHOOK_URL, { content });
  } catch (e) {
    console.error("❌ Discord falhou:", e.response?.status, e.response?.data || e.message);
  }
}

// ========== fechamento ==========
export async function fechamentoDiario() {
  try {
    await garantirArquivo();
    const dados = await fs.readJson(FILE_PATH);

    const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const pagamentosHoje = dados.pagamentos.filter((p) => p.data.startsWith(hoje));
    const totalHoje = pagamentosHoje.reduce((acc, p) => acc + Number(p.valor || 0), 0);

    if (totalHoje === 0) {
      console.log("Fechamento: sem pagamentos hoje. Nada a enviar.");
      return;
    }

    let recorde = Number(dados.recorde || 0);
    let mensagem = `📅 **Fechamento diário:** R$ ${totalHoje.toFixed(2)}\n`;

    if (totalHoje > recorde) {
      mensagem += `🏆 **Novo recorde diário!** (anterior: R$ ${recorde.toFixed(2)})`;
      recorde = totalHoje;
    } else {
      mensagem += `📈 Recorde atual: R$ ${recorde.toFixed(2)}`;
    }

    dados.recorde = recorde;
    await fs.writeJson(FILE_PATH, dados);
    await safeDiscord(mensagem);
    console.log("✅ Fechamento enviado ao Discord.");
  } catch (err) {
    console.error("❌ Erro no fechamento:", err.response?.status, err.response?.data || err.message);
  }
}

// ========== rotas ==========
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "asaas-discord-webhook",
    version: "v1.0.0",
    tz: TZ,
    time: new Date().toISOString(),
    hasDiscordWebhook: Boolean(DISCORD_WEBHOOK_URL),
  });
});

app.post("/asaas", async (req, res) => {
  try {
    const {
  event: asaasEvent,
  payment = {},
  subscription = {},
  customer = {}
} = req.body;

    if (asaasEvent === "PAYMENT_CONFIRMED") {
      const valor = Number(payment.value || 0);
      await registrarPagamento(valor);
      await safeDiscord(
        `💰 Pagamento confirmado!\n` +
        `👤 Cliente: ${payment.customerName || customer.name || "—"}\n` +
        `💵 Valor: R$ ${valor.toFixed(2)}`
      );
    }

    if (asaasEvent === "SUBSCRIPTION_CREATED") {
  const valor = Number(subscription.value || 0);

  await registrarAssinatura({
    id: subscription.id || null,
    name: subscription.name || subscription.description || null,
    customerId: subscription.customer || customer.id || null,
    customerName: customer.name || subscription.customerName || "—",
    value: valor,
    billingType: subscription.billingType || null,
    cycle: subscription.cycle || null,
    createdAt: new Date().toISOString(),
  });

  await safeDiscord(
    "🆕 Nova assinatura criada!\n" +
    `👤 Cliente: ${customer.name || subscription.customerName || "—"}\n` +
    `📦 Plano: ${subscription.name || subscription.description || "—"}\n` +
    `💵 Valor: R$ ${valor.toFixed(2)}`
  );
}
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Erro /asaas:", err.response?.status, err.response?.data || err.message);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

app.post("/fechamento-manual", async (_req, res) => {
  await fechamentoDiario();
  res.status(200).send("Fechamento disparado");
});

// ========== cron diário 23:59 (BRT) ==========
cron.schedule(
  "59 23 * * *",
  () => {
    console.log("Executando fechamento diário (cron)...");
    fechamentoDiario();
  },
  { timezone: TZ }
);

// Lista assinaturas mais recentes (DESC). Query: ?limit=20
app.get("/assinaturas", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    await garantirArquivoSubs();
    const dados = await fs.readJson(SUBS_FILE);

    const itens = (dados.assinaturas || [])
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    // extras úteis: total, ticket médio
    const total = itens.reduce((acc, s) => acc + Number(s.value || 0), 0);
    const ticket = itens.length ? total / itens.length : 0;

    res.status(200).json({
      count: itens.length,
      total,
      ticket,
      itens,
    });
  } catch (e) {
    console.error("❌ Erro /assinaturas:", e.message);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// ========== start ==========
app.listen(PORT, () => console.log("Webhook ativo na porta", PORT));
