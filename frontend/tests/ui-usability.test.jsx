import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import SetupWizard from "../src/components/SetupWizard";
import { AgentProgress } from "../src/components/AgentProgress";
import { SettingsView } from "../src/components/SettingsView";
import { TaskInitiationSupport } from "../src/components/TaskInitiationSupport";
import { WorkingMemoryDisplay } from "../src/components/WorkingMemoryDisplay";
import { todayKey } from "../src/utils/helpers";

afterEach(() => cleanup());

describe("UI usability safeguards", () => {
  it("keeps recovered energy consistent with the daily budget", () => {
    render(
      <WorkingMemoryDisplay
        state={{
          capacity: "steady",
          energyLog: [
            { id: "spent", day: todayKey(), delta: 4 },
            { id: "rested", day: todayKey(), delta: -2 },
          ],
          activeFocus: null,
          wins: [],
        }}
        settings={{ winddown: "23:59", displayName: "" }}
        onWinddownClick={() => {}}
      />
    );

    const totals = screen.getByText(/4 uttagen · 2 återhämtad/);
    expect(totals.previousElementSibling).toHaveTextContent("18");
    expect(totals.previousElementSibling).toHaveTextContent("av 20");
  });

  it("lets a new user skip optional tasks and the tour", () => {
    const onComplete = vi.fn();
    render(<SetupWizard onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: "Kom igång" }));
    fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
    fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoppa över uppgifter" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoppa över rundturen" }));

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      settings: { wake: "07:00", winddown: "22:00" },
      capacity: "steady",
      tasks: [],
    });
  });

  it("exposes settings as keyboard-oriented tabs with connections in the same dialog", () => {
    render(
      <SettingsView
        state={{
          username: "test",
          settings: {
            wake: "07:00",
            winddown: "22:00",
            theme: "system",
            voiceLang: "sv-SE",
            defaultCapacity: "steady",
            defaultFocusMinutes: 25,
            visibleTools: {},
            autoSync: false,
            ouraToken: "",
          },
          agents: { classify: true, refine: true, breakdown: true, sync: true, observer: true },
          externalAiEnabled: false,
          oura: { day: null, manual: null },
        }}
        onPatch={() => {}}
        onToggleExternalAi={() => {}}
        onLogout={() => {}}
        onClose={() => {}}
        googleConnectHref="/connect/google"
        onSyncNow={() => {}}
      />
    );

    const connectionsTab = screen.getByRole("tab", { name: "Kopplingar" });
    fireEvent.click(connectionsTab);

    expect(connectionsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Kopplingar" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Koppla Google" })).toHaveAttribute("href", "/connect/google");
  });

  it("starts the first unfinished task step without mutating it", () => {
    const onStartStep = vi.fn();
    const task = {
      id: "task-1",
      title: "Skriv rapport",
      energy: 3,
      minutes: 30,
      steps: [
        { id: "done", title: "Öppna dokumentet", minutes: 2, done: true },
        { id: "next", title: "Skriv rubriken", minutes: 5, done: false },
      ],
    };

    render(<TaskInitiationSupport task={task} onStartStep={onStartStep} onSetTrigger={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Börja med detta/ }));

    expect(onStartStep).toHaveBeenCalledWith(task, task.steps[1]);
    expect(task.steps[1].done).toBe(false);
  });

  it("announces agent progress without announcing animated dots", () => {
    render(<AgentProgress step="Sorteraren" text="Arbetar" isRunning />);

    expect(screen.getByRole("status")).toHaveTextContent("Sorteraren pågår");
    expect(screen.getByRole("status")).not.toHaveTextContent("...");
  });
});
