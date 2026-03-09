import("./console-bridge")
  .catch(() => {})
  .then(() => {
    if (location.pathname === "/loading") {
      import("./loading")
    } else {
      import("./")
    }
  })
