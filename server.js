import express from "express";
import axios from "axios";
import cron from "node-cron";
import fs from "fs-extra";

const app = express();
app.use(express.json());

// ==== CONFIGURAÇÕES ====
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1425846663406293104/ogatLz_IN8IDTV4csargKRGEz7rErt9IG6IsUus8YZw-eU8X4NHvzbsbkCdbxVJQ68sW";
const FILE_PATH = "./pagamentos.json";

// ==== FUNÇÃO PARA GARANTIR O ARQUIVO ====
async function garantirArquivo() {
  if (!(await fs.pathExists(FILE_PATH))) {
    await fs.writeJson(FILE_PATH, { pagamentos: [], recorde: 0 });
  }
}

// ==== FUNÇÃO PARA REGISTRAR PAGAMENTO ====
async function registrarPagamento(valor) {
  await garantirArquivo();
  const dados = await fs.readJson(FILE_PATH);
  dados.pagamentos.push({
    valor,
    data: new Date().toISOString()
  });
  await fs.writeJson(FILE_PATH, dados);
}

// ==== FUNÇÃO DE FECHAMENTO ====
async function fechamentoDiario() {
  await garantirArquivo();
  const dados = await fs.readJson(FILE_PATH);

  const hoje = new Date().toISOString().slice(0, 10);
  const pagamentosHoje = dados.pagamentos.filter(p => p.data.startsWith(hoje));
  const totalHoje = pagamentosHoje.reduce((acc, p) => acc + p.valor, 0);

  if (totalHoje === 0) return; // não envia se não houve pagamentos

  let recorde = dados.recorde;
  let mensagem = `📅 *Fechamento diário:* R$ ${totalHoje.toFixed(2)}\n`;

  if (totalHoje > recorde) {
    recorde = totalHoje;
    mensagem += `🏆 *Novo recorde diário!* 🎉`;
  } else {
    mensagem += `📈 Recorde atual: R$ ${recorde.toFixed(2)}`;
  }

  // Atualiza recorde
  dados.recorde = recorde;
  await fs.writeJson(FILE_PATH, dados);

  // Envia pro Discord
  await axios.post(DISCORD_WEBHOOK_URL, { content: mensagem });
}

// ==== CRON DIÁRIO 23h59 ====
cron.schedule("59 23 * * *", () => {
  console.log("Executando fechamento diário...");
  fechamentoDiario();
});

// ==== WEBHOOK DO ASAAS ====
app.post("/asaas", async (req, res) => {
  const event = req.body.event;
  const payment = req.body.payment || {};

  if (event === "PAYMENT_CONFIRMED") {
    const valor = Number(payment.value || 0);
    await registrarPagamento(valor);

    const msg = `💰 Pagamento confirmado!\nCliente: ${payment.customerName}\nValor: R$ ${valor.toFixed(2)}`;
    await axios.post(DISCORD_WEBHOOK_URL, { content: msg });
  }

  res.status(200).send("OK");
});

// endpoint pra disparar manualmente
app.post("/fechamento-manual", async (req, res) => {
  await fechamentoDiario();
  res.status(200).send("Fechamento disparado");
});

app.listen(3000, () => console.log("Webhook ativo na porta 3000"));
