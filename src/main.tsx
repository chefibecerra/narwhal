import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";

document.documentElement.classList.add("dark");

// Sin StrictMode: el doble montaje de dev duplicaría los streams de logs.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
