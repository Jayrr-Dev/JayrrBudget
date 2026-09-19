export function budgetPingCopy(
  name: string,
  warn: boolean,
  over: boolean,
): { title: string; message: string } {
  const budget = name.trim() || "This budget";
  if (over) {
    if (!warn) {
      return {
        title: `${budget} went over`,
        message: `${budget} passed the overage mark. Spending is already past the cap.`,
      };
    }
    return {
      title: `${budget} warning or over`,
      message: `${budget} hit the warning or went over. Open the budget and see what pushed it.`,
    };
  }
  return {
    title: `${budget} warning`,
    message: `${budget} hit the warning mark. There's still a little room left.`,
  };
}
