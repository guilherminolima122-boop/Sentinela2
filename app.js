const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let map = null, quakeLayer = null, mapReady = false, toastTimer = null, weatherData = null;
let selectedPlace = {name:"São Paulo", latitude:-23.5505, longitude:-46.6333};

function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2700);
}
function safeText(value) {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function setView(view) {
  $$(".tab").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach(section => section.classList.toggle("hidden", section.id !== `view-${view}`));
  if (view === "map") { initMap(); setTimeout(() => { if (map) map.invalidateSize(); }, 100); }
}
$$(".tab").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
$("#showAll").addEventListener("click", () => toast("Os links oficiais abrem os sites de origem. O Sentinela ainda não recebe avisos oficiais automaticamente."));
function renderOfficialPanelTime(){
  const node=$("#officialPanelTime");
  if(node) node.textContent="Painel aberto nesta sessão: "+new Date().toLocaleString("pt-BR");
}
$("#refreshBtn").addEventListener("click", () => { loadRecentEarthquakes(); loadWeather(); toast("Atualizando dados públicos…"); });
$("#changeLocation").addEventListener("click", async () => {
  const next = prompt("Digite uma cidade para consultar a previsão:", $("#locationLabel").textContent);
  if (!next || !next.trim()) return;
  $("#locationLabel").textContent = next.trim(); $("#weatherPlace").textContent = next.trim();
  toast("Procurando a cidade…");
  try {
    const url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(next.trim()) + "&count=1&language=pt&format=json";
    const response = await fetch(url); if (!response.ok) throw new Error("Geocodificação indisponível");
    const data = await response.json();
    if (!data.results || !data.results.length) throw new Error("Cidade não encontrada");
    const place = data.results[0]; selectedPlace = {name:[place.name,place.admin1,place.country].filter(Boolean).join(", "),latitude:place.latitude,longitude:place.longitude};
    $("#locationLabel").textContent = selectedPlace.name; $("#weatherPlace").textContent = place.name; await loadWeather(); toast("Região atualizada.");
  } catch (error) { toast("Não encontrei essa cidade. Confira o nome e tente novamente."); }
});
$("#shareWeather").addEventListener("click", shareWeatherOnWhatsApp);
$("#creditsBtn").addEventListener("click", () => $("#creditsScene").classList.remove("hidden"));
$("#closeCredits").addEventListener("click", () => $("#creditsScene").classList.add("hidden"));
function closeIntro(){ const intro=$("#introScene"); if(intro){intro.style.animation="none";intro.style.opacity="0";intro.style.visibility="hidden";intro.style.pointerEvents="none";} }
$("#skipIntro").addEventListener("click", closeIntro);
setTimeout(closeIntro, 5500);

const weatherDescriptions = {
  0:"Céu limpo",1:"Predominantemente limpo",2:"Parcialmente nublado",3:"Nublado",45:"Nevoeiro",48:"Nevoeiro com geada",
  51:"Garoa leve",53:"Garoa moderada",55:"Garoa intensa",56:"Garoa congelante leve",57:"Garoa congelante intensa",
  61:"Chuva fraca",63:"Chuva moderada",65:"Chuva forte",66:"Chuva congelante leve",67:"Chuva congelante forte",
  71:"Neve fraca",73:"Neve moderada",75:"Neve forte",77:"Grãos de neve",80:"Pancadas fracas",81:"Pancadas moderadas",82:"Pancadas fortes",
  85:"Pancadas de neve fracas",86:"Pancadas de neve fortes",95:"Trovoada",96:"Trovoada com granizo leve",99:"Trovoada com granizo forte"
};
function weatherLabel(code){ return weatherDescriptions[Number(code)] || "Condição não identificada"; }
async function loadWeather(){
  const headline=$("#weatherHeadline"), summary=$("#weatherSummary"), status=$("#weatherStatus");
  headline.textContent="Consultando…";
  summary.textContent="Fonte: Open-Meteo";
  status.textContent="Buscando previsão atualizada…";
  status.classList.remove("weather-concern");
  try {
    const params = new URLSearchParams({
      latitude:String(selectedPlace.latitude),
      longitude:String(selectedPlace.longitude),
      current:"temperature_2m,precipitation,weather_code,wind_speed_10m",
      hourly:"precipitation_probability,precipitation,wind_speed_10m",
      forecast_days:"1",
      timezone:"auto"
    });
    // Evita cabeçalhos personalizados que podem provocar preflight CORS no navegador.
    const response=await fetch("https://api.open-meteo.com/v1/forecast?"+params.toString(), {
      cache:"no-store"
    });
    if(!response.ok) throw new Error("Fonte indisponível (HTTP "+response.status+")");
    const data=await response.json();
    const current=data.current||{}, hourly=data.hourly||{};
    if(!current.time || current.temperature_2m==null || current.weather_code==null) {
      throw new Error("Resposta meteorológica incompleta");
    }

    // Localiza a hora da previsão correspondente à hora atual informada pela API.
    const times=Array.isArray(hourly.time)?hourly.time:[];
    let idx=times.findIndex(t=>t>=current.time);
    if(idx<0 && times.length) idx=times.length-1;

    const chanceRaw=idx>=0?(hourly.precipitation_probability||[])[idx]:null;
    const rainRaw=idx>=0?(hourly.precipitation||[])[idx]:null;
    const windRaw=current.wind_speed_10m ?? (idx>=0?(hourly.wind_speed_10m||[])[idx]:null);
    const rainChance=chanceRaw==null?null:Number(chanceRaw);
    const rainAmount=rainRaw==null?null:Number(rainRaw);
    const wind=windRaw==null?null:Number(windRaw);
    const code=Number(current.weather_code);

    if(!Number.isFinite(code) ||
       (rainChance!==null && !Number.isFinite(rainChance)) ||
       (rainAmount!==null && !Number.isFinite(rainAmount)) ||
       (wind!==null && !Number.isFinite(wind))) {
      throw new Error("Dados meteorológicos inválidos");
    }
    if(rainChance===null && rainAmount===null && wind===null) {
      throw new Error("A fonte não retornou os indicadores de chuva e vento");
    }

    weatherData={
      place:selectedPlace.name,
      condition:weatherLabel(code),
      temperature:current.temperature_2m,
      rainChance,
      rainAmount,
      wind,
      checkedAt:new Date().toLocaleString("pt-BR")
    };
    headline.textContent=weatherLabel(code);
    summary.textContent=Math.round(Number(current.temperature_2m))+" °C • Fonte: Open-Meteo";
    $("#rainMetric").textContent=rainAmount===null?"—":rainAmount.toLocaleString("pt-BR",{maximumFractionDigits:1})+" mm";
    $("#rainChance").textContent=rainChance===null?"—":Math.round(rainChance)+"%";
    $("#windMetric").textContent=wind===null?"—":Math.round(wind)+" km/h";
    $("#weatherIcon").textContent=code>=95?"ϟ":((rainAmount??0)>=1||(rainChance??0)>=50)?"☂":"◇";

    const concerning=(rainChance!==null && rainAmount!==null && rainChance>=80 && rainAmount>=2) ||
      (rainAmount!==null && rainAmount>=7.5) || (wind!==null && wind>=60) || code>=95;
    if(concerning) {
      status.textContent="Condição que merece atenção: a previsão indica chuva/vento/trovoada potencialmente intensa. Confira agora os avisos oficiais da Defesa Civil e do INMET.";
      status.classList.add("weather-concern");
    } else {
      status.textContent="Consulta concluída. Traços (—) significam que a fonte não forneceu aquele dado. Isso não garante ausência de perigo; confira avisos oficiais.";
    }
    $("#weatherSummary").textContent=`Atualizado ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})} • Open-Meteo`;
  } catch(error) {
    headline.textContent="Previsão indisponível";
    summary.textContent="Não foi possível validar os dados recebidos";
    status.textContent="A consulta falhou: "+(error && error.message ? error.message : "erro desconhecido")+". Verifique a conexão e consulte as fontes oficiais.";
    $("#rainMetric").textContent="—";
    $("#rainChance").textContent="—";
    $("#windMetric").textContent="—";
    weatherData=null;
    status.classList.remove("weather-concern");
  }
}
function openWhatsApp(text){ const url="https://wa.me/?text="+encodeURIComponent(text); window.open(url,"_blank","noopener"); }
function shareWeatherOnWhatsApp(){
  if(!weatherData){toast("A previsão ainda não carregou. Tente atualizar.");return;}
  const message=`SENTINELA • Aviso de previsão (não é alerta oficial)\nRegião: ${weatherData.place}\nCondição: ${weatherData.condition}\nTemperatura: ${weatherData.temperature ?? "não informada"} °C\nChuva na próxima hora: ${weatherData.rainAmount ?? "não informada"} mm • Probabilidade: ${weatherData.rainChance == null ? "não informada" : weatherData.rainChance+"%"}\nVento: ${weatherData.wind == null ? "não informado" : weatherData.wind+" km/h"}\nConsulta: ${weatherData.checkedAt}\nConfira os avisos oficiais: https://portal.inmet.gov.br/ e https://www.gov.br/mdr/pt-br/assuntos/protecao-e-defesa-civil`;
  openWhatsApp(message); toast("WhatsApp aberto com o texto pronto. Revise antes de enviar.");
}
function initMap() {
  if (mapReady || !window.L) { if (!window.L) $("#mapStatus").textContent = "Mapa indisponível: confira a conexão com a internet."; return; }
  mapReady = true; map = L.map("map").setView([-14.2, -51.9], 3.5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:18, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
  quakeLayer = L.layerGroup().addTo(map); loadRecentEarthquakes();
}
async function loadRecentEarthquakes() {
  $("#mapStatus").textContent = "Consultando o feed público do USGS…";
  try {
    const response = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", {cache:"no-store"});
    if (!response.ok) throw new Error("Feed indisponível");
    const data = await response.json(), features = Array.isArray(data.features) ? data.features : [];
    $("#quakeCount").textContent = `${features.length} eventos`;
    if (map && quakeLayer) {
      quakeLayer.clearLayers();
      features.forEach(feature => {
        const coordinates = feature.geometry && feature.geometry.coordinates; if (!coordinates || coordinates.length < 2) return;
        const [longitude, latitude, depth] = coordinates, props = feature.properties || {}, magnitude = Number(props.mag);
        const marker = L.circleMarker([latitude, longitude], {radius:Math.max(4,Math.min(11,4+(Number.isFinite(magnitude)?magnitude:0))),color:"#ffbd69",fillColor:"#ffbd69",fillOpacity:.78,weight:1});
        const when = props.time ? new Date(props.time).toLocaleString("pt-BR") : "Horário não informado";
        marker.bindPopup(`<strong>${safeText(props.title || "Terremoto")}</strong><br>Magnitude: ${Number.isFinite(magnitude)?magnitude:"não informada"}<br>Profundidade: ${Number.isFinite(depth)?depth.toFixed(1)+" km":"não informada"}<br>${safeText(when)}<br><a href="${safeText(props.url || "https://earthquake.usgs.gov/")}" target="_blank" rel="noopener">Ver registro no USGS</a>`).addTo(quakeLayer);
      });
    }
    $("#mapStatus").textContent = `Feed USGS consultado: ${features.length} eventos nas últimas 24 horas. Eventos globais; não indicam necessariamente risco para sua cidade.`;
  } catch {
    $("#quakeCount").textContent = "Sem conexão";
    $("#mapStatus").textContent = "Não foi possível carregar o feed do USGS. Confira a internet e tente atualizar. Nenhum dado foi inventado.";
  }
}

function getMembers() { try { const value=JSON.parse(localStorage.getItem("sentinela-family")||"[]"); return Array.isArray(value)?value.filter(item=>typeof item==="string"):[]; } catch { return []; } }
function saveMembers(members) { try { localStorage.setItem("sentinela-family",JSON.stringify(members)); return true; } catch { toast("Não foi possível salvar neste navegador."); return false; } }
function renderMembers() {
  const members=getMembers(), container=$("#familyList");
  if (!members.length) { container.innerHTML='<p class="muted">Ainda não há integrantes. Adicione nomes ou apelidos para testar a lista neste aparelho.</p>'; return; }
  container.innerHTML=members.map((name,index)=>`<div class="member"><div class="avatar">${safeText((name.trim()[0]||"?").toUpperCase())}</div><div class="member-name">${safeText(name)}<small>Salvo somente neste aparelho</small></div><button class="remove-btn" data-remove="${index}" aria-label="Remover integrante">Remover</button></div>`).join("");
  $$("[data-remove]").forEach(button=>button.addEventListener("click",()=>{const current=getMembers();current.splice(Number(button.dataset.remove),1);saveMembers(current);renderMembers();toast("Integrante removido deste aparelho.");}));
}
$("#familyForm").addEventListener("submit",event=>{event.preventDefault();const input=$("#memberName"),name=input.value.trim();if(!name)return;const members=getMembers();if(members.length>=20){toast("Limite de demonstração: 20 integrantes.");return;}members.push(name);if(saveMembers(members)){input.value="";renderMembers();toast("Adicionado neste aparelho; não sincroniza com outros celulares.");}});
renderMembers();

function renderAnnouncements() {
  const container=$("#alertsList");
  const originals=[
    {title:"Chuva intensa",body:"Cartão ilustrativo para demonstrar a interface.",date:"Exemplo",emoji:"🌧️"},
    {title:"Risco de deslizamento",body:"Consulte a Defesa Civil da sua região para informações oficiais.",date:"Exemplo",emoji:"⛰️"}
  ];
  const demos=originals.map(item=>`<article class="alert-card demo-card"><div class="alert-top"><span class="status-chip demo">SIMULAÇÃO</span><span class="time">${item.date}</span></div><div class="alert-title"><span class="event-emoji">${item.emoji}</span><div><h3>${item.title}</h3><p>${item.body}</p></div></div><div class="alert-footer"><span>Não é um aviso oficial</span><span class="arrow">↗</span></div></article>`).join("");
  container.innerHTML=demos;
  // Shared administrator notices only appear when the app is hosted with its server API.
  fetch("/api/announcements", {headers:{"Accept":"application/json"}, cache:"no-store"})
    .then(response=>{if(!response.ok) throw new Error("API indisponível"); return response.json();})
    .then(data=>{
      const items=Array.isArray(data.announcements)?data.announcements:[];
      const cards=items.slice().reverse().map(item=>`<article class="alert-card"><div class="alert-top"><span class="status-chip admin-message">COMUNICADO DO ADMINISTRADOR</span><span class="time">${safeText(item.publishedAt||"Horário não informado")}</span></div><div class="alert-title"><span class="event-emoji">📣</span><div><h3>${safeText(item.title||"Comunicado")}</h3><p><strong>${safeText(item.category||"Informativo")}</strong><br>${safeText(item.body||"")}<br><br><strong>Fonte informada:</strong> ${safeText(item.sourceLabel||"Não informada")} ${item.sourceUrl?`<a href="${safeText(item.sourceUrl)}" target="_blank" rel="noopener">Abrir fonte ↗</a>`:""}</p></div></div><div class="alert-footer"><span>Comunicado do administrador; confirme na fonte original</span><span class="arrow">↗</span></div></article>`).join("");
      container.innerHTML=cards+demos;
    }).catch(()=>{});
}
const eventGuidance={
  "Chuva forte / tempestade":["Fique em uma construção segura e longe de janelas durante ventos fortes.","Durante raios, evite áreas abertas, árvores e água; prefira abrigo fechado.","Não atravesse ruas alagadas nem tente passar por enxurradas."],
  "Enchente / inundação":["Separe documentos, medicamentos, água, lanterna e celular carregado.","Se houver risco, vá para local seguro e elevado conforme orientação oficial.","Nunca atravesse água de enchente a pé ou de carro; afaste-se de fios e instalações molhadas."],
  "Deslizamento de terra":["Observe sinais como rachaduras novas, portas emperrando, árvores inclinadas ou ruídos incomuns.","Se houver sinais de perigo, saia da área e avise a Defesa Civil de um local seguro.","Não retorne até a liberação das autoridades."],
  "Terremoto":["Durante o tremor, abaixe-se, proteja cabeça e pescoço e abrigue-se sob móvel resistente, se possível.","Afaste-se de janelas e objetos que possam cair.","Depois, evite prédios danificados e prepare-se para réplicas."],
  "Tsunami":["Em região costeira, diante de alerta oficial ou forte terremoto sentido na costa, afaste-se imediatamente da praia.","Vá para terreno elevado ou para o interior seguindo rotas de evacuação.","Não espere para observar as ondas e não volte até a liberação oficial."],
  "Incêndio florestal":["Siga orientações de evacuação e afaste-se da fumaça.","Vá para a área segura indicada pelas autoridades.","Não tente combater um incêndio de grandes proporções sozinho."],
  "Tornado / ventos extremos":["Procure cômodo interno no andar mais baixo, longe de janelas.","Proteja cabeça e pescoço e evite árvores e estruturas frágeis.","Não fique ao ar livre tentando filmar o fenômeno."],
  "Onda de calor":["Beba água regularmente e reduza esforço físico nas horas mais quentes.","Procure local fresco e acompanhe orientações de saúde oficiais.","Ajude crianças, idosos e pessoas vulneráveis sem deixá-los em veículos fechados."],
  "Comunicado geral":["Confirme as informações em uma fonte confiável antes de compartilhar.","Siga as orientações das autoridades competentes.","Não divulgue boatos nem apresente este cartão como alerta oficial."]
};
let publicCardMessage="";
$("#publicCardForm").addEventListener("submit",event=>{
  event.preventDefault();
  const type=$("#cardEvent").value, period=$("#cardPeriod").value, region=$("#cardRegion").value.trim()||"Não informada", source=$("#cardSource").value.trim()||"Não informada", extra=$("#cardExtra").value.trim();
  const advice=eventGuidance[type]||eventGuidance["Comunicado geral"];
  const now=new Date().toLocaleString("pt-BR");
  publicCardMessage=`⚠️ SENTINELA — CARTÃO PREVENTIVO\n\nEvento selecionado: ${type}\nPeríodo informado: ${period}\nRegião: ${region}\nCriado em: ${now}\nFonte informada: ${source}\n\nORIENTAÇÕES GERAIS:\n${advice.map((line,i)=>`${i+1}. ${line}`).join("\n")}\n${extra?"\nInformação adicional fornecida pelo criador: "+extra+"\n":"\n"}\nIMPORTANTE: cartão criado por usuário. Não confirma que o evento vai acontecer e não é um alerta oficial. Confirme qualquer risco e siga a Defesa Civil e os órgãos competentes.\nEmergência no Brasil: Bombeiros 193; Defesa Civil 199.`;
  const preview=$("#publicCardPreview"); preview.textContent=publicCardMessage; preview.classList.remove("hidden"); $("#sharePublicCard").classList.remove("hidden"); toast("Cartão criado. Confira os dados antes de compartilhar.");
});
$("#sharePublicCard").addEventListener("click",()=>{if(!publicCardMessage){toast("Crie o cartão primeiro.");return;}openWhatsApp(publicCardMessage);toast("WhatsApp aberto. Revise e envie manualmente.");});
renderAnnouncements();
renderOfficialPanelTime();
loadWeather();
// Atualiza a previsão periodicamente enquanto o app estiver aberto.
setInterval(() => { if (document.visibilityState === "visible") loadWeather(); }, 10 * 60 * 1000);
if (window.L) initMap(); else $("#mapStatus").textContent="A biblioteca do mapa não carregou. Confira a conexão com a internet.";
