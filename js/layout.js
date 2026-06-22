const shell = document.querySelector("#appShell");
const leftButton = document.querySelector("#toggleLeftSidebar");
const rightButton = document.querySelector("#toggleRightSidebar");

const LEFT_KEY = "socialgo_left_sidebar_collapsed";
const RIGHT_KEY = "socialgo_right_sidebar_collapsed";

function applySavedLayout() {
  const leftCollapsed = localStorage.getItem(LEFT_KEY) === "1";
  const rightCollapsed = localStorage.getItem(RIGHT_KEY) === "1";

  shell?.classList.toggle("left-collapsed", leftCollapsed);
  shell?.classList.toggle("right-collapsed", rightCollapsed);

  if (leftButton) {
    leftButton.textContent = leftCollapsed ? "☰" : "‹";
    leftButton.title = leftCollapsed ? "Mostrar menú" : "Contraer menú";
  }

  if (rightButton) {
    rightButton.textContent = rightCollapsed ? "‹" : "›";
    rightButton.title = rightCollapsed ? "Mostrar panel" : "Contraer panel";
  }
}

leftButton?.addEventListener("click", () => {
  const collapsed = !shell.classList.contains("left-collapsed");
  shell.classList.toggle("left-collapsed", collapsed);
  localStorage.setItem(LEFT_KEY, collapsed ? "1" : "0");
  applySavedLayout();
});

rightButton?.addEventListener("click", () => {
  const collapsed = !shell.classList.contains("right-collapsed");
  shell.classList.toggle("right-collapsed", collapsed);
  localStorage.setItem(RIGHT_KEY, collapsed ? "1" : "0");
  applySavedLayout();
});

applySavedLayout();
