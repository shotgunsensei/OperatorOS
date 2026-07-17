export const colors = {
  ink: "#090B0B",
  panel: "#111414",
  panelLift: "#181C1B",
  line: "#2C302F",
  paper: "#F2F1ED",
  muted: "#8B918E",
  orange: "#F26218",
  orangeHot: "#FF7B24",
  green: "#62DB8E",
};

export const apiUrl = (process.env.EXPO_PUBLIC_TORQUESHED_API_URL ?? "https://torqueshed.pro").replace(/\/$/, "");
export const operatorOsAuthUrl = (process.env.EXPO_PUBLIC_OPERATOROS_AUTH_URL ?? "https://auth.operatoros.net").replace(/\/$/, "");
export const operatorOsAppUrl = (process.env.EXPO_PUBLIC_OPERATOROS_APP_URL ?? "https://app.operatoros.net").replace(/\/$/, "");
