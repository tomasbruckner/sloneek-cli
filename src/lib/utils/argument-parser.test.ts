import { describe, it, expect, vi, afterEach } from "vitest";
import { parseArgs } from "./argument-parser";

const originalArgv = process.argv;
const originalExit = process.exit;

function parseArgsWithArgv(argv: string[]): any {
  process.argv = ["node", "sloneek", ...argv];
  process.exit = ((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as any;
  return parseArgs();
}

afterEach(() => {
  process.argv = originalArgv;
  process.exit = originalExit;
});

describe("argument-parser", () => {
  describe("log command", () => {
    it("parses basic log command with message", () => {
      const result = parseArgsWithArgv(["log", "-m", "Working on feature"]);
      expect(result.command).toBe("log");
      expect(result.message).toBe("Working on feature");
      expect(result.interactiveClient).toBe(false);
      expect(result.interactiveProject).toBe(false);
    });

    it("parses log with from/to times", () => {
      const result = parseArgsWithArgv(["log", "-m", "Work", "-f", "9:00", "-t", "17:00"]);
      expect(result.from).toBe("9:00");
      expect(result.to).toBe("17:00");
    });

    it("parses log with --day option", () => {
      const result = parseArgsWithArgv(["log", "-m", "Work", "-d", "15.6"]);
      expect(result.day).toBe("15.6");
    });

    it("parses log with --yesterday flag", () => {
      const result = parseArgsWithArgv(["log", "-m", "Work", "-y"]);
      expect(result.yesterday).toBe(true);
    });

    it("processes escape sequences in message", () => {
      const result = parseArgsWithArgv(["log", "-m", "line1\\nline2"]);
      expect(result.message).toBe("line1\nline2");
    });

    it("parses log with --profile option", () => {
      const result = parseArgsWithArgv(["log", "-m", "Work", "-r", "myProfile"]);
      expect(result.profile).toBe("myProfile");
    });

    it("parses log with --client and --project flags", () => {
      const result = parseArgsWithArgv(["log", "-m", "Work", "-c", "-p"]);
      expect(result.interactiveClient).toBe(true);
      expect(result.interactiveProject).toBe(true);
    });
  });

  describe("list command", () => {
    it("parses basic list command", () => {
      const result = parseArgsWithArgv(["list"]);
      expect(result.command).toBe("list");
      expect(result.other).toBe(false);
    });

    it("parses list with --other flag", () => {
      const result = parseArgsWithArgv(["list", "-o"]);
      expect(result.other).toBe(true);
    });

    it("parses list with --team filter", () => {
      const result = parseArgsWithArgv(["list", "-o", "-t", "Engineering,Design"]);
      expect(result.teamPrefixes).toEqual(["Engineering", "Design"]);
    });

    it("parses list with --client filter", () => {
      const result = parseArgsWithArgv(["list", "-c", "Acme"]);
      expect(result.client).toBe("Acme");
    });
  });

  describe("report command", () => {
    it("parses basic report command", () => {
      const result = parseArgsWithArgv(["report"]);
      expect(result.command).toBe("report");
      expect(result.validate).toBe(false);
      expect(result.summary).toBe(false);
    });

    it("parses report with --validate and --summary", () => {
      const result = parseArgsWithArgv(["report", "--validate", "--summary"]);
      expect(result.validate).toBe(true);
      expect(result.summary).toBe(true);
    });

    it("parses report with --month", () => {
      const result = parseArgsWithArgv(["report", "--month", "2025-08"]);
      expect(result.month).toBe("2025-08");
    });

    it("parses report with --team and --name filters", () => {
      const result = parseArgsWithArgv(["report", "-t", "Eng,QA", "-n", "John"]);
      expect(result.teams).toEqual(["Eng", "QA"]);
      expect(result.name).toBe("John");
    });

    it("parses report with --ignore-today", () => {
      const result = parseArgsWithArgv(["report", "--validate", "--ignore-today"]);
      expect(result.ignoreToday).toBe(true);
    });
  });

  describe("absence command", () => {
    it("parses absence command", () => {
      const result = parseArgsWithArgv(["absence"]);
      expect(result.command).toBe("absence");
    });
  });

  describe("absence-cancel command", () => {
    it("parses absence-cancel command", () => {
      const result = parseArgsWithArgv(["absence-cancel"]);
      expect(result.command).toBe("absence-cancel");
    });
  });

  describe("log-cancel command", () => {
    it("parses log-cancel command", () => {
      const result = parseArgsWithArgv(["log-cancel"]);
      expect(result.command).toBe("log-cancel");
    });
  });

  describe("init command", () => {
    it("parses init command", () => {
      const result = parseArgsWithArgv(["init"]);
      expect(result.command).toBe("init");
    });

    it("parses init with --profile", () => {
      const result = parseArgsWithArgv(["init", "-r", "work"]);
      expect(result.profile).toBe("work");
    });
  });

  describe("profile command", () => {
    it("parses profile command", () => {
      const result = parseArgsWithArgv(["profile"]);
      expect(result.command).toBe("profile");
      expect(result.remove).toBe(false);
    });

    it("parses profile with --delete flag", () => {
      const result = parseArgsWithArgv(["profile", "-d"]);
      expect(result.remove).toBe(true);
    });
  });

  describe("team-report command", () => {
    it("parses basic team-report command", () => {
      const result = parseArgsWithArgv(["team-report"]);
      expect(result.command).toBe("team-report");
    });

    it("parses team-report with options", () => {
      const result = parseArgsWithArgv([
        "team-report",
        "-c",
        "ClientX",
        "-p",
        "ProjA,ProjB",
        "--month",
        "9.2025",
      ]);
      expect(result.client).toBe("ClientX");
      expect(result.projects).toEqual(["ProjA", "ProjB"]);
      expect(result.month).toBe("9.2025");
    });

    it("parses team-report with --previous-month", () => {
      const result = parseArgsWithArgv(["team-report", "--previous-month"]);
      expect(result.previousMonth).toBe(true);
    });
  });

  describe("report-detail command", () => {
    it("parses basic report-detail command", () => {
      const result = parseArgsWithArgv(["report-detail"]);
      expect(result.command).toBe("report-detail");
    });

    it("parses report-detail with --user and --month", () => {
      const result = parseArgsWithArgv(["report-detail", "-u", "John", "--month", "2025-08"]);
      expect(result.user).toBe("John");
      expect(result.month).toBe("2025-08");
    });
  });
});
