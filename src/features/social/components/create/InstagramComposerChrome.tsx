import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

type ComposerTab = "post" | "story" | "swipe";
type ComposerStep = "select" | "edit" | "share";

type HeaderProps = {
  title: string;
  borderColor: string;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  mutedTextColor: string;
  draftBusy: boolean;
  primaryBusy: boolean;
  primaryLabel: string;
  onBack: () => void;
  onDraft: () => void;
  onPrimary: () => void;
};

type TypeTabsProps = {
  activeTab: ComposerTab;
  accentColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  surfaceColor: string;
  onSelectTab: (tab: ComposerTab) => void;
};

type StepStripProps = {
  activeStep: ComposerStep;
  accentColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  surfaceColor: string;
  subtleSurfaceColor: string;
  onSelectStep: (step: ComposerStep) => void;
};

const TYPE_TABS: Array<{ id: ComposerTab | "live"; label: string; disabled?: boolean }> = [
  { id: "post", label: "POST" },
  { id: "story", label: "STORY" },
  { id: "swipe", label: "SWIPES" },
  { id: "live", label: "LIVE", disabled: true },
];

const STEP_TABS: Array<{ id: ComposerStep; label: string; shortLabel: string }> = [
  { id: "select", label: "Choose media and frame", shortLabel: "Select" },
  { id: "edit", label: "Enhance with tools", shortLabel: "Edit" },
  { id: "share", label: "Caption and publish", shortLabel: "Share" },
];

export function InstagramComposerHeader({
  title,
  borderColor,
  backgroundColor,
  accentColor,
  textColor,
  mutedTextColor,
  draftBusy,
  primaryBusy,
  primaryLabel,
  onBack,
  onDraft,
  onPrimary,
}: HeaderProps) {
  return (
    <View style={[styles.headerWrap, { backgroundColor, borderColor }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Icon name="arrow-back" size={22} color={textColor} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: textColor }]}>{title}</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerTextAction} onPress={onDraft} disabled={draftBusy}>
            {draftBusy ? (
              <ActivityIndicator size="small" color={mutedTextColor} />
            ) : (
              <Text style={[styles.headerTextActionLabel, { color: accentColor }]}>Draft</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerPrimaryAction, { backgroundColor: "#0095f6" }]}
            onPress={onPrimary}
            disabled={primaryBusy}
          >
            {primaryBusy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.headerPrimaryActionLabel}>{primaryLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export function InstagramComposerTypeTabs({
  activeTab,
  accentColor,
  textColor,
  mutedTextColor,
  borderColor,
  surfaceColor,
  onSelectTab,
}: TypeTabsProps) {
  return (
    <View style={[styles.typeTabsWrap, { borderColor, backgroundColor: surfaceColor }]}>
      {TYPE_TABS.map((tab) => {
        const selected = tab.id === activeTab;
        const disabled = !!tab.disabled;

        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.typeTabButton}
            onPress={() => {
              if (!disabled && tab.id !== "live") {
                onSelectTab(tab.id);
              }
            }}
            disabled={disabled}
            activeOpacity={0.86}
          >
            <Text
              style={[
                styles.typeTabLabel,
                { color: selected ? textColor : mutedTextColor },
                selected && styles.typeTabLabelActive,
                disabled && styles.typeTabLabelDisabled,
              ]}
            >
              {tab.label}
            </Text>
            <View
              style={[
                styles.typeTabUnderline,
                selected && { backgroundColor: accentColor },
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function InstagramComposerStepStrip({
  activeStep,
  accentColor,
  textColor,
  mutedTextColor,
  borderColor,
  surfaceColor,
  subtleSurfaceColor,
  onSelectStep,
}: StepStripProps) {
  return (
    <View style={styles.stepStripWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stepStripContent}
      >
        {STEP_TABS.map((step, index) => {
          const selected = step.id === activeStep;

          return (
            <TouchableOpacity
              key={step.id}
              style={[
                styles.stepCard,
                {
                  borderColor: selected ? accentColor : borderColor,
                  backgroundColor: selected ? `${accentColor}12` : surfaceColor,
                },
              ]}
              activeOpacity={0.88}
              onPress={() => onSelectStep(step.id)}
            >
              <View
                style={[
                  styles.stepIndexBadge,
                  { backgroundColor: selected ? accentColor : subtleSurfaceColor },
                ]}
              >
                <Text style={[styles.stepIndexText, { color: selected ? "#ffffff" : mutedTextColor }]}>
                  {index + 1}
                </Text>
              </View>
              <View style={styles.stepTextWrap}>
                <Text style={[styles.stepTitle, { color: selected ? textColor : mutedTextColor }]}>
                  {step.shortLabel}
                </Text>
                <Text style={[styles.stepDescription, { color: mutedTextColor }]} numberOfLines={1}>
                  {step.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    minHeight: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 12,
    flexShrink: 0,
  },
  headerTextAction: {
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  headerTextActionLabel: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerPrimaryAction: {
    minWidth: 74,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPrimaryActionLabel: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  typeTabsWrap: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  typeTabButton: {
    flex: 1,
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 0,
  },
  typeTabLabel: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  typeTabLabelActive: {
    fontWeight: "900",
  },
  typeTabLabelDisabled: {
    opacity: 0.42,
  },
  typeTabUnderline: {
    width: "100%",
    height: 2.5,
    marginTop: 12,
    backgroundColor: "transparent",
  },
  stepStripWrap: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  stepStripContent: {
    gap: 10,
    paddingRight: 16,
  },
  stepCard: {
    width: 176,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndexText: {
    fontSize: 13,
    fontWeight: "900",
  },
  stepTextWrap: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  stepDescription: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
  },
});
