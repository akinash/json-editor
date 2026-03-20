import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ThemeModeProvider } from "@/app/ThemeModeProvider";
import { EditorPage } from "./EditorPage";

vi.mock("./components/ObjectCard", () => ({
  ObjectCard: ({ entry }: { entry: { key: string } }) => <div>{entry.key}</div>,
}));

vi.mock("./components/JsonCodeEditor", () => ({
  JsonCodeEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="JSON-редактор"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

function renderPage() {
  return render(
    <ThemeModeProvider>
      <EditorPage />
    </ThemeModeProvider>,
  );
}

describe("EditorPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          autumn_2025: {
            description: "Осень",
            options: {
              aspectRatio: "xMaxYMid",
              gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
            },
            "options-portrait": {
              aspectRatio: "xMaxYMid",
              gradient: "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
            },
          },
        }),
    }));
  });

  it("loads config from URL on mount and renders parsed entries", async () => {
    renderPage();

    expect(await screen.findByText("autumn_2025")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows JSON parse error when editor content is invalid", async () => {
    renderPage();
    const editor = await screen.findByLabelText("JSON-редактор");

    fireEvent.change(editor, { target: { value: "{invalid json" } });

    expect(await screen.findByText(/Ошибка JSON:/)).toBeTruthy();
  });

  it("updates rendered entries when valid JSON is edited manually", async () => {
    renderPage();
    const editor = await screen.findByLabelText("JSON-редактор");

    fireEvent.change(editor, {
      target: {
        value: JSON.stringify(
          {
            winter_2025: {
              options: {
                aspectRatio: "xMaxYMid",
                gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
              },
              "options-portrait": {
                aspectRatio: "xMaxYMid",
                gradient: "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
              },
            },
          },
          null,
          2,
        ),
      },
    });

    await waitFor(() => {
      expect(screen.getByText("winter_2025")).toBeTruthy();
    });
  });
});
