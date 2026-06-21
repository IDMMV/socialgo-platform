export function demoRegister(user) {
  const safeUser = {
    username: String(user.username || "").trim().toLowerCase(),
    email: String(user.email || "").trim().toLowerCase(),
    accountType: user.accountType || "personal"
  };
  localStorage.setItem("socialgo_demo_user", JSON.stringify(safeUser));
  return safeUser;
}

export function demoLogin(email) {
  localStorage.setItem("socialgo_demo_user", JSON.stringify({
    username: "usuario_demo",
    email: String(email || "").trim().toLowerCase(),
    accountType: "personal"
  }));
}
