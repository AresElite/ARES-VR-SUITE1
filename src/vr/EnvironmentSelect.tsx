import { useState } from "react";
import { useAppStore } from "@/app/providers/appStore";
import { SpatialPanel, PanelText, PanelButton } from "./SpatialPanel";
import { ARES_COLORS } from "@/ares/colors";
import { SELECTABLE_ENVIRONMENTS } from "@/ares/environments";
import type { EnvironmentId } from "@/ares/drillTypes";

/**
 * ENVIRONMENT SELECT — the first thing an athlete sees on entering the suite.
 *
 * Live preview: the arena behind this panel is already rendering whatever is
 * highlighted, so the choice is made by looking at the venue rather than by
 * reading its name. Confirming stores the preference and drops into the arena.
 */
export function EnvironmentSelect() {
  const pref = useAppStore((s) => s.environmentPref);
  const setPref = useAppStore((s) => s.setEnvironmentPref);
  const goHome = useAppStore((s) => s.goHome);

  const [i, setI] = useState(() => {
    const at = SELECTABLE_ENVIRONMENTS.findIndex((e) => e.id === pref);
    return at < 0 ? 0 : at;
  });
  const opt = SELECTABLE_ENVIRONMENTS[i];

  const step = (d: number) => {
    const n =
      (i + d + SELECTABLE_ENVIRONMENTS.length) % SELECTABLE_ENVIRONMENTS.length;
    setI(n);
    // preview immediately — the surround updates as they scroll
    setPref(SELECTABLE_ENVIRONMENTS[n].id as EnvironmentId);
  };

  return (
    <group>
      <SpatialPanel
        position={[0, 1.5, -1.5]}
        width={1.6}
        height={1.12}
        title="CHOOSE YOUR ENVIRONMENT"
        accent={ARES_COLORS.deepPurple}
      >
        <PanelText
          position={[-0.73, 0.42, 0]}
          text="THE VENUE IS SURROUND ONLY. YOUR TRAINING SPACE DOES NOT CHANGE."
          size={0.028}
          color={ARES_COLORS.softGray}
        />

        <PanelButton
          position={[-0.56, 0.16, 0]}
          label="<"
          onClick={() => step(-1)}
          width={0.2}
          height={0.18}
        />
        <PanelText
          position={[-0.28, 0.2, 0]}
          text={opt.label}
          size={0.062}
          color={ARES_COLORS.white}
        />
        <PanelButton
          position={[0.56, 0.16, 0]}
          label=">"
          onClick={() => step(1)}
          width={0.2}
          height={0.18}
        />
        <PanelText
          position={[-0.28, 0.09, 0]}
          text={opt.blurb}
          size={0.03}
          color={ARES_COLORS.electricTeal}
        />
        <PanelText
          position={[-0.28, 0.02, 0]}
          text={`${i + 1} / ${SELECTABLE_ENVIRONMENTS.length}`}
          size={0.026}
          color={ARES_COLORS.softGray}
        />

        <PanelText
          position={[-0.73, -0.16, 0]}
          text="ASSESSMENTS AND VISION TESTS IGNORE THIS CHOICE."
          size={0.026}
          color={ARES_COLORS.softGray}
        />
        <PanelText
          position={[-0.73, -0.23, 0]}
          text="THOSE DRILLS KEEP A FIXED VISUAL WORLD SO THEIR NUMBERS STAY COMPARABLE."
          size={0.026}
          color={ARES_COLORS.softGray}
        />

        <PanelButton
          position={[0, -0.44, 0]}
          label="ENTER THE ARENA"
          onClick={goHome}
          width={0.86}
          height={0.14}
          color={ARES_COLORS.deepPurple}
          accent={ARES_COLORS.electricTeal}
        />
      </SpatialPanel>
    </group>
  );
}
