import React from "react";
import { ThemeProvider } from "@mui/material";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { makeTheme } from "@/design/theme";
import { GradientGeneratorField } from "./GradientGeneratorDialog";

function renderField(props?: Partial<React.ComponentProps<typeof GradientGeneratorField>>) {
  const onChange = vi.fn();
  render(
    <ThemeProvider theme={makeTheme("light")}>
      <GradientGeneratorField
        label="Градиент"
        value=""
        onChange={onChange}
        expectedRatio={16 / 9}
        {...props}
      />
    </ThemeProvider>,
  );
  return { onChange };
}

describe("GradientGeneratorField", () => {
  beforeEach(() => {
    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      width = 1600;
      height = 900;
      naturalWidth = 1600;
      naturalHeight = 900;
      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    vi.stubGlobal("Image", MockImage);
  });

  it("opens dialog and closes it on cancel", async () => {
    const user = userEvent.setup();
    renderField({ targetLabel: "Mobile" });

    await user.click(screen.getByLabelText("Сгенерировать градиент из изображения"));

    expect(screen.getByText("Генерация градиента из изображения")).toBeTruthy();
    expect(screen.getByText("Mobile")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Отмена" }));

    await waitFor(() => {
      expect(screen.queryByText("Генерация градиента из изображения")).toBeNull();
    });
  });

  it("applies existing gradient and calls onChange", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({
      value: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
    });

    await user.click(screen.getByLabelText("Сгенерировать градиент из изображения"));
    await user.click(screen.getByRole("button", { name: "Применить" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toContain("linear-gradient(");
  });

  it("loads image from CDN and reveals gradient generation action without resizing dialog actions", async () => {
    const user = userEvent.setup();
    renderField({
      canLoadFromCdn: true,
      cdnImageUrl: "https://example.com/mobile-day.jpeg",
      targetLabel: "Mobile",
    });

    await user.click(screen.getByLabelText("Сгенерировать градиент из изображения"));
    await user.click(screen.getByRole("button", { name: "Загрузить из CDN" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Сгенерировать градиент" })).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: "Отмена" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Применить" })).toBeTruthy();
  });
});
