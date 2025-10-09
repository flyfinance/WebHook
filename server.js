import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1425846663406293104/ogatLz_IN8IDTV4csargKRGEz7rErt9IG6IsUus8YZw-eU8X4NHvzbsbkCdbxVJQ68sW";

app.post("/asaas", async (req, res) => {
  const event = req.body.event;
  const payment = req.body.payment || {};

  if (event === "PAYMENT_CONFIRMED") {
    const msg = {
      content: `💰 Pagamento confirmado!\nCliente: ${payment.customerName}\nValor: R$ ${payment.value}`
    };
    await axios.post(DISCORD_WEBHOOK_URL, msg);
  }

  res.status(200).send("OK");
});

app.listen(3000, () => console.log("Webhook ativo na porta 3000"));
