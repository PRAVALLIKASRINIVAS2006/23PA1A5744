import { Card, CardContent, Chip, Typography, Stack } from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import WorkIcon from "@mui/icons-material/Work";
import GradeIcon from "@mui/icons-material/Grade";

const TYPE_CONFIG = {
  Placement: { color: "success", icon: <WorkIcon fontSize="small" /> },
  Result: { color: "warning", icon: <GradeIcon fontSize="small" /> },
  Event: { color: "info", icon: <EventIcon fontSize="small" /> },
};

export function NotificationCard({ notification }) {
  const { Type, Message, Timestamp } = notification;
  const config = TYPE_CONFIG[Type] ?? { color: "default", icon: null };

  const formatted = new Date(Timestamp).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
          <Chip
            icon={config.icon}
            label={Type}
            color={config.color}
            size="small"
            sx={{ fontWeight: 600 }}
          />
          <Typography variant="caption" color="text.secondary">
            {formatted}
          </Typography>
        </Stack>
        <Typography variant="body2" mt={1} sx={{ textTransform: "capitalize" }}>
          {Message}
        </Typography>
      </CardContent>
    </Card>
  );
}
