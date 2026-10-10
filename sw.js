
self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "Sentinela",
      body: event.data ? event.data.text() : "Você recebeu um novo aviso."
    };
  }

  const title = data.title || "Sentinela";
  const options = {
    body: data.body || "Há um novo aviso disponível.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: data.url || "/"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  );

  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    clients.openWindow(target.href)
  );
});
