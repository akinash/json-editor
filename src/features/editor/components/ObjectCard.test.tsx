import React from "react";
import { ThemeProvider } from "@mui/material";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeTheme } from "@/design/theme";
import type { ConfigEntry } from "@/shared/types/config";
import { ObjectCard } from "./ObjectCard";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

vi.mock("./GradientGeneratorDialog", () => ({
  GradientGeneratorField: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

function makeEntry(): ConfigEntry {
  return {
    key: "autumn_2025",
    data: {
      value: "autumn_2025",
      description: "Осень",
      "value-portrait": "autumn_2025-portrait",
      options: {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
      },
      "options-portrait": {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
      },
    },
  };
}

function makeRangeEntry(): ConfigEntry {
  return {
    ...makeEntry(),
    data: {
      ...makeEntry().data,
      options: {
        aspectRatio: "xMaxYMid",
        gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
        start: "01.03.****",
        end: "10.03.****",
      },
    },
  };
}

function renderCard(overrides?: Partial<React.ComponentProps<typeof ObjectCard>>) {
  const onChange = vi.fn();
  const props: React.ComponentProps<typeof ObjectCard> = {
    sortableId: "row-0",
    entry: makeEntry(),
    expanded: true,
    status: "ok",
    duplicateCodeSet: new Set<string>(),
    assetsBaseUrl: "",
    onExpanded: vi.fn(),
    onChange,
    onClone: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };

  render(
    <ThemeProvider theme={makeTheme("light")}>
      <ObjectCard {...props} />
    </ThemeProvider>,
  );

  return { onChange, props };
}

describe("ObjectCard", () => {
  it("updates key and derived values when code changes", async () => {
    const { onChange } = renderCard();

    const codeInput = screen.getByLabelText("Код заставки");
    fireEvent.change(codeInput, { target: { value: "winter_2025" } });

    const lastCall = onChange.mock.calls.at(-1)?.[0] as ConfigEntry;
    expect(lastCall.key).toBe("winter_2025");
    expect(lastCall.data.value).toBe("winter_2025");
    expect(lastCall.data["value-portrait"]).toBe("winter_2025-portrait");
  });

  it("edits desktop gradient without changing mobile gradient", () => {
    const { onChange } = renderCard();

    const gradientInputs = screen.getAllByLabelText("Градиент");
    fireEvent.change(gradientInputs[0], {
      target: { value: "linear-gradient(45deg, rgb(10,10,10) 0%, rgb(20,20,20) 100%)" },
    });

    const next = onChange.mock.calls.at(-1)?.[0] as ConfigEntry;
    expect(next.data.options.gradient).toBe(
      "linear-gradient(45deg, rgb(10,10,10) 0%, rgb(20,20,20) 100%)",
    );
    expect(next.data["options-portrait"].gradient).toBe(
      "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
    );
  });

  it("enables time-of-day for mobile only", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCard();

    const switches = screen.getAllByRole("switch");
    await user.click(switches[1]);

    const next = onChange.mock.calls.at(-1)?.[0] as ConfigEntry;
    expect(next.data.options.gradient).toBe(
      "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
    );
    expect(next.data["options-portrait"].morning).toBe("day");
    expect(next.data["options-portrait"].day).toBe("day");
    expect(next.data["options-portrait"].evening).toBe("night");
    expect(next.data["options-portrait"].night).toBe("night");
    expect(next.data["options-portrait"].gradient).toEqual({
      day: "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
      night: "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
    });
  });

  it("switches desktop rule type to range and prepares start/end fields", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCard();

    const ruleType = screen.getByRole("combobox");
    fireEvent.mouseDown(ruleType);

    const option = await screen.findByRole("option", { name: "Диапазон дат" });
    await user.click(option);

    const next = onChange.mock.calls.at(-1)?.[0] as ConfigEntry;
    expect(next.data.options.start).toBe("");
    expect(next.data.options.end).toBe("");
    expect(next.data.options.startDayOfYear).toBeUndefined();
    expect(next.data.options.endDayOfYear).toBeUndefined();
  });

  it("renders range date inputs when entry is already in range mode", () => {
    renderCard({ entry: makeRangeEntry() });

    expect(screen.getByLabelText("Дата начала")).toBeTruthy();
    expect(screen.getByLabelText("Дата конца")).toBeTruthy();
  });
});
