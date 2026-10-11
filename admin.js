const $ = s => document.querySelector(s);

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(data.error || "Falha na consulta ao servidor");
  }

  return data;
}

function showConsole(logged) {
  $("#adminLogin").classList.toggle("hidden", logged);
  $("#adminConsole").classList.toggle("hidden", !logged);
}

async function checkSession() {
  try {
    const data = await api("/api/admin/me");
    showConsole(!!data.authenticated);
  } catch {
    showConsole(false);
  }
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  const message = $("#loginMessage");
  message.textContent = "Verificando…";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password: $("#password").value
      })
    });

    $("#password").value = "";
    message.textContent = "";
    showConsole(true);
  } catch (err) {
    message.textContent = err.message;
  }
});

async function logout() {
  try {
    await api("/api/admin/logout", {
      method: "POST",
      body: "{}"
    });
  } catch {}

  showConsole(false);
}

$("#logoutBtn").addEventListener("click", logout);
$("#logoutBtnBottom").addEventListener("click", logout);

$("#publishForm").addEventListener("submit", async e => {
  e.preventDefault();

  const message = $("#publishMessage");
  message.textContent = "Publicando…";

  const payload = {
    title: $("#title").value.trim(),
    category: $("#category").value,
    body: $("#body").value.trim(),
    sourceLabel: $("#sourceLabel").value.trim(),
    sourceUrl: $("#sourceUrl").value.trim()
  };

  try {
    await api("/api/admin/announcements", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    message.textContent =
      "Comunicado publicado. Abra o modo público para conferir.";

    $("#publishForm").reset();
  } catch (err) {
    message.textContent = err.message;
  }
});

const pushTestBtn = $("#pushTestBtn");

if (pushTestBtn) {
  pushTestBtn.addEventListener("click", async () => {
    const message = $("#pushTestMessage");

    pushTestBtn.disabled = true;
    message.textContent = "Enviando teste…";

    try {
      const data = await api("/api/admin/push/test", {
        method: "POST",
        body: "{}"
      });

      message.textContent = data.enviados > 0
        ? `Servidor aceitou o envio para ${data.enviados} dispositivo(s). Confira seu celular.`
        : "Nenhum envio confirmado pelo serviço de notificações.";
    } catch (err) {
      message.textContent = "Falha no teste: " + err.message;
    } finally {
      pushTestBtn.disabled = false;
    }
  });
}

checkSession();

