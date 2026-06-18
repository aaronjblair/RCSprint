// Electron shell for RCSprint — loads the built static Vite app from dist/.
// CommonJS (.cjs) so it runs regardless of the package's "type":"module".
const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#0a0c10",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, "../dist/index.html"));
  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    // macOS: re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Quit on all platforms except macOS, where apps stay alive until Cmd+Q.
  if (process.platform !== "darwin") app.quit();
});
