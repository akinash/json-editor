import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeModeProvider } from "@/app/ThemeModeProvider";
import { EditorPage } from "@/features/editor/EditorPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeModeProvider>
      <EditorPage />
    </ThemeModeProvider>
  </React.StrictMode>,
);
