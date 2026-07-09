import { useMemo, useState } from "react";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { useAppStore } from "@/app/providers/appStore";
import { buildPrescription } from "@/prescribe/prescription";
import { drillById } from "@/drills/registry";
import { SpatialPanel, PanelButton, PanelText } from "./SpatialPanel";
import { sfx } from "@/utils/audio";

/**
 * TODAY'S PLAN — the closed loop, in the arena.
 * The prescription engine reads every stored session and posts up to five
 * prioritized items. One tap launches the drill at the prescribed level
 * (through the normal briefing/calibration flow — never skipping safety).
 */
export function TodaysPlanPanel() {
  const sessions = useAppStore((s) => s.sessions);
  const athlete = useAppStore((s) => s.athlete);
  const launchPrescribed = useAppStore((s) => s.launchPrescribed);

  const plan = useMemo(() => buildPrescription(sessions, athlete.id), [sessions, athlete.id]);
  const [open, setOpen] = useState(false);
  if (plan.length === 0) return null;

  // Collapsed by default: a single pill, tucked left of the welcome console,
  // never blocking the Assess/Acquire portals. Opens on demand, closes on X.
  if (!open) {
    return (
      <group position={[-1.15, 0.62, -1.45]} rotation={[0, 0.5, 0]}>
        <PanelButton
          position={[0, 0, 0]}
          width={0.62}
          height={0.11}
          fontSize={0.036}
          label={`TODAY'S PLAN (${plan.length})`}
          color={ARES_COLORS.deepPurple}
          textColor={ARES_ACCENTS.purpleGlow}
          onClick={() => {
            sfx.uiClick();
            setOpen(true);
          }}
        />
      </group>
    );
  }

  const rowH = 0.155;
  const height = 0.34 + plan.length * rowH;

  return (
    <group position={[-1.35, 1.18, -1.5]} rotation={[0, 0.55, 0]}>
      <SpatialPanel position={[0, 0, 0]} width={1.16} height={height} title="TODAY'S PLAN" accent={ARES_ACCENTS.purpleGlow}>
        {/* close */}
        <PanelButton
          position={[0.51, height / 2 - 0.075, 0.001]}
          width={0.085}
          height={0.085}
          fontSize={0.04}
          label="X"
          color={ARES_COLORS.errorRed}
          onClick={() => {
            sfx.uiClick();
            setOpen(false);
          }}
        />
        <PanelText
          position={[-0.52, height / 2 - 0.155, 0]}
          text={`Prescribed for ${athlete.name} — weakest systems first`}
          size={0.032}
          color={ARES_COLORS.softGray}
          maxWidth={1.05}
        />
        {plan.map((item, i) => {
          const def = drillById(item.drillId);
          const color = def ? PHASE_META[def.phase].color : ARES_COLORS.electricTeal;
          const y = height / 2 - 0.28 - i * rowH;
          return (
            <group key={item.drillId}>
              <PanelButton
                position={[-0.24, y, 0]}
                width={0.62}
                height={0.095}
                fontSize={0.03}
                label={`${i + 1}. ${item.drillName}${def && !def.assessment && !def.rhythm ? ` — LV ${item.level}` : ""}`}
                color={ARES_COLORS.deepPurple}
                textColor={color}
                onClick={() => {
                  sfx.uiClick();
                  launchPrescribed(item.drillId, item.level);
                }}
              />
              <PanelText
                position={[0.14, y + 0.014, 0]}
                text={item.reason}
                size={0.0225}
                color={ARES_COLORS.softGray}
                maxWidth={0.42}
              />
            </group>
          );
        })}
      </SpatialPanel>
    </group>
  );
}
