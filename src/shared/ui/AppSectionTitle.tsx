import { Stack, Typography } from "@mui/material";

export function AppSectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="h3">{title}</Typography>
      {subtitle ? (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      ) : null}
    </Stack>
  );
}
