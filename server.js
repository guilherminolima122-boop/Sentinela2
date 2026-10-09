const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "announcements.json");

if (ADMIN_PASSWORD.length < 16) {
  console.error("ERRO: defina ADMIN_PASSWORD no ambiente do servidor com pelo menos 16 caracteres.");
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  console.error("ERRO: defina SESSION_SECRET no ambiente do servidor com pelo menos 32 caracteres aleatórios.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(session({
  name: "sentinela.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 2 * 60 * 60 * 1000 }
}));
const loginLimiter = rateLimit({windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: {error:"Muitas tentativas. Aguarde 15 minutos e tente novamente."}});
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function readAnnouncements() {
  try { const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
function writeAnnouncements(items) {
  fs.mkdirSync(DATA_DIR, {recursive:true});
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2), {mode:0o600});
  fs.renameSync(tmp, DATA_FILE);
}
function requireAdmin(req, res, next) { if (req.session && req.session.isAdmin === true) return next(); return res.status(401).json({error:"Sessão administrativa necessária."}); }
app.get("/api/health", (_req,res)=>res.json({ok:true, service:"Sentinela API"}));
app.get("/api/announcements", (_req,res)=>res.json({announcements:readAnnouncements()}));
app.post("/api/admin/login", loginLimiter, (req,res)=>{
  const supplied = req.body && req.body.password;
  if (typeof supplied !== "string" || !safeEqual(supplied, ADMIN_PASSWORD)) return res.status(401).json({error:"Senha incorreta."});
  req.session.regenerate(err=>{
    if (err) return res.status(500).json({error:"Não foi possível iniciar sessão."});
    req.session.isAdmin = true;
    req.session.save(saveErr=>{ if(saveErr) return res.status(500).json({error:"Não foi possível salvar a sessão."}); res.json({ok:true}); });
  });
});
app.get("/api/admin/me", (req,res)=>res.json({authenticated:!!(req.session && req.session.isAdmin===true)}));
app.post("/api/admin/logout", (req,res)=>{ if(!req.session) return res.json({ok:true}); req.session.destroy(()=>{res.clearCookie("sentinela.sid",{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production"});res.json({ok:true});}); });
app.post("/api/admin/announcements", requireAdmin, (req,res)=>{
  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim().slice(0,100) : "";
  const message = typeof body.body === "string" ? body.body.trim().slice(0,2000) : "";
  const category = typeof body.category === "string" ? body.category.slice(0,60) : "Informativo";
  const sourceLabel = typeof body.sourceLabel === "string" ? body.sourceLabel.trim().slice(0,160) : "";
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim().slice(0,500) : "";
  if (!title || !message) return res.status(400).json({error:"Preencha título e mensagem."});
  if (sourceUrl) { try { const url = new URL(sourceUrl); if(!["https:","http:"].includes(url.protocol)) throw new Error(); } catch { return res.status(400).json({error:"O link da fonte precisa ser uma URL HTTP ou HTTPS válida."}); } }
  const items = readAnnouncements();
  const item = {id:crypto.randomUUID(), title, body:message, category, sourceLabel:sourceLabel || "Não informada", sourceUrl, publishedAt:new Date().toLocaleString("pt-BR"), status:"admin-communication-not-official"};
  items.push(item);
  try { writeAnnouncements(items.slice(-100)); return res.status(201).json({ok:true, announcement:item}); }
  catch { return res.status(500).json({error:"Não foi possível salvar. Confira se o servidor permite gravar na pasta data."}); }
});
app.use(express.static(__dirname, {index:"index.html", dotfiles:"deny"}));
app.listen(PORT, ()=>console.log(`Sentinela iniciado na porta ${PORT}.`));
