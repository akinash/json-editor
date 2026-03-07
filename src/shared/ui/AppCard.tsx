import { Paper, PaperProps } from "@mui/material";

export function AppCard(props: PaperProps) {
  return <Paper {...props} sx={{ p: 2, ...props.sx }} />;
}
