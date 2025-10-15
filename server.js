// server.js
import express from "express";
import axios from "axios";
import cron from "node-cron";
import fs from "fs-extra";

const app = express();
app.use(express.json());

// 🔧 troque pelo seu webhook do Discord (use discord.com)
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1425846663406293104/ogatLz_IN8IDTV4csargKRGEz7rErt9IG6IsUus8YZw-eU8X4NHvzbsbkCdbxVJQ68sW";
const FILE_PATH = "./pagamentos.json";

// ===== utils de storage =====
async function garantirArquivo() {
  if (!(await fs.pathExists(FILE_PATH))) {
    await fs.writeJson(FILE_PATH, { pagamentos: [], recorde: 0 });
  }
}
async function registrarPagamento(valor) {
  await garantirArquivo();
  const dados = await fs.readJson(FILE_PATH);
  dados.pagamentos.push({ valor: Number(valor || 0), data: new Date().toISOString() });
  await fs.writeJson(FILE_PATH, dados);
}

// ===== fechamento =====
export async function fechamentoDiario() {
  try {
    await garantirArquivo();
    const dados = await fs.readJson(FILE_PATH);

    const hoje = new Date().toISOString().slice(0, 10);
    const pagamentosHoje = dados.pagamentos.filter(p => p.data.startsWith(hoje));
    const totalHoje = pagamentosHoje.reduce((acc, p) => acc + Number(p.valor || 0), 0);

    if (totalHoje === 0) {
      console.log("Fechamento: sem pagamentos hoje.");
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

    await axios.post(DISCORD_WEBHOOK_URL, { content: mensagem });
    console.log("✅ Fechamento enviado ao Discord.");
  } catch (err) {
    console.error("❌ Erro no fechamento:", err.response?.status, err.response?.data || err.message);
  }
}

// ===== rotas =====
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "asaas-discord-webhook",
    version: "v1.0.0",
    time: new Date().toISOString(),
  });
});

app.post("/asaas", async (req, res) => {
  try {
    const { event, payment = {} } = req.body;
    if (event === "PAYMENT_CONFIRMED") {
      const valor = Number(payment.value || 0);
      await registrarPagamento(valor);
      await axios.post(DISCORD_WEBHOOK_URL, {
        content: `💰 Pagamento confirmado!\nCliente: ${payment.customerName}\nValor: R$ ${valor.toFixed(2)}`
      });
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Erro /asaas:", err.response?.status, err.response?.data || err.message);
    res.status(500).send("Erro");
  }
});

app.post("/fechamento-manual", async (_req, res) => {
  await fechamentoDiario();
  res.status(200).send("Fechamento disparado");
});

// ===== cron diário 23:59 BRT =====
cron.schedule("59 23 * * *", () => {
  console.log("Executando fechamento diário (cron)...");
  fechamentoDiario();
}, { timezone: "America/Sao_Paulo" });

// ===== start =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Webhook ativo na porta", PORT));
