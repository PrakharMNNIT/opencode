import("./console-bridge").then(() => {
  if (location.pathname === "/loading") {
    import("./loading")
  } else {
    import("./")
  }
})
