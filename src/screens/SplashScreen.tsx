import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";
import LinearGradient from "react-native-linear-gradient";

import { API } from "../api/api";
import { clearStoredSession, getStoredToken } from "../utils/authSession";
import { alpha, appFonts } from "../theme/designSystem";

const GUEST_ONBOARDING_KEY = "aline2_guest_intro_seen";

const GUEST_SLIDES = [
  {
    eyebrow: "Everything in one app",
    title: "Aline2 Present",
    body: "Trusted social, creator, and service connections in one premium place with a calmer, richer first look.",
    icon: "sparkles-outline",
    orbitIcons: ["people-outline", "shield-checkmark-outline"],
    highlights: ["Trusted", "Premium", "Connected"],
    shellGradient: ["#05070D", "#070A12", "#05070D"],
    orbGradient: ["#0A1E33", "#0C2F53", "#06111D"],
    iconGradient: ["#FFFFFF", "#CFF6FF"],
    accentGradient: ["#19DAFF", "#0A69FF"],
    haloColor: "rgba(16,149,255,0.24)",
  },
  {
    eyebrow: "Communities that feel alive",
    title: "Connect with friends and influencers",
    body: "Build identity, discover people, and stay close to your favorite communities with a brighter social vibe.",
    icon: "people-outline",
    orbitIcons: ["chatbubbles-outline", "heart-outline"],
    highlights: ["Friends", "Creators", "Chats"],
    shellGradient: ["#05070D", "#09040B", "#05070D"],
    orbGradient: ["#271130", "#61195B", "#250D2C"],
    iconGradient: ["#73C6FF", "#F75CFF"],
    accentGradient: ["#6E90FF", "#FF2AC4"],
    haloColor: "rgba(240,28,188,0.22)",
  },
  {
    eyebrow: "Grow your service business",
    title: "Become a seller and get appointments",
    body: "Turn your services into bookings, seller chats, and appointment growth inside Aline2 with a more professional vibe.",
    icon: "storefront-outline",
    orbitIcons: ["calendar-outline", "cash-outline"],
    highlights: ["Bookings", "Clients", "Growth"],
    shellGradient: ["#05070D", "#07111A", "#05070D"],
    orbGradient: ["#0A1A2C", "#0C3D67", "#08111D"],
    iconGradient: ["#36D8FF", "#FF3FC7"],
    accentGradient: ["#14DFFF", "#FF39C9"],
    haloColor: "rgba(0,153,255,0.2)",
  },
] as const;

const SplashScreen = ({ navigation }: any) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [showGuestIntro, setShowGuestIntro] = useState(false);
  const timeoutHandlesRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const activeSlide = useMemo(() => GUEST_SLIDES[slideIndex] || GUEST_SLIDES[0], [slideIndex]);

  const clearScheduledTimers = () => {
    timeoutHandlesRef.current.forEach((handle) => clearTimeout(handle));
    timeoutHandlesRef.current = [];
  };

  const navigateGuestToLogin = useCallback(async () => {
    await AsyncStorage.setItem(GUEST_ONBOARDING_KEY, "true").catch(() => {});
    navigation.replace("Login");
  }, [navigation]);

  const runGuestIntro = useCallback(async () => {
    setShowGuestIntro(true);
    setSlideIndex(0);
  }, []);

  const checkLaunchState = useCallback(async () => {
    const token = await getStoredToken();

    if (!token) {
      const hasSeenGuestIntro = (await AsyncStorage.getItem(GUEST_ONBOARDING_KEY).catch(() => null)) === "true";

      if (!hasSeenGuestIntro) {
        runGuestIntro().catch(() => {
          navigation.replace("Login");
        });
        return;
      }

      const loginHandle = setTimeout(() => {
        navigation.replace("Login");
      }, 1200);
      timeoutHandlesRef.current.push(loginHandle);
      return;
    }

    const authHandle = setTimeout(async () => {
      try {
        await API.get("/auth/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        navigation.reset({
          index: 0,
          routes: [{ name: "MainApp" }],
        });
      } catch (error: any) {
        console.log("Session validation failed:", error);
        await clearStoredSession();
        navigation.replace("Login");
      }
    }, 1200);

    timeoutHandlesRef.current.push(authHandle);
  }, [navigation, runGuestIntro]);

  useEffect(() => {
    checkLaunchState().catch(() => {
      navigation.replace("Login");
    });

    return () => {
      clearScheduledTimers();
    };
  }, [checkLaunchState, navigation]);

  const handleNext = () => {
    if (slideIndex >= GUEST_SLIDES.length - 1) {
      navigateGuestToLogin().catch(() => {
        navigation.replace("Login");
      });
      return;
    }

    setSlideIndex((current) => Math.min(current + 1, GUEST_SLIDES.length - 1));
  };

  const handleSkip = () => {
    navigateGuestToLogin().catch(() => {
      navigation.replace("Login");
    });
  };

  return (
    <LinearGradient colors={activeSlide.shellGradient as unknown as string[]} style={styles.container}>
      <StatusBar backgroundColor="#05070D" barStyle="light-content" />

      <View style={styles.heroSection}>
        <View
          style={[
            styles.heroShell,
            {
              shadowColor: activeSlide.haloColor,
            },
          ]}
        >
          <LinearGradient
            colors={activeSlide.orbGradient as unknown as string[]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.heroOrb}
          >
            <View style={styles.heroShade} />
          </LinearGradient>
        </View>

        <View style={styles.sparkleCluster}>
          {[0, 1, 2, 3, 4, 5].map((entry) => (
            <View
              key={entry}
              style={[
                styles.sparkleDot,
                {
                  opacity: 0.45 + (entry % 3) * 0.18,
                  transform: [{ scale: 0.8 + (entry % 3) * 0.2 }],
                },
              ]}
            />
          ))}
        </View>

        <View style={[styles.heroCore, { backgroundColor: alpha("#08111D", "E6"), borderColor: alpha(activeSlide.accentGradient[0], "32") }]}>
          <View style={[styles.heroCoreGlow, { backgroundColor: alpha(activeSlide.accentGradient[0], "16") }]} />
          {activeSlide.orbitIcons.map((iconName, index) => (
            <View
              key={iconName}
              style={[
                styles.heroOrbitBadge,
                index === 0 ? styles.heroOrbitBadgeLeft : styles.heroOrbitBadgeRight,
                {
                  backgroundColor: alpha(activeSlide.accentGradient[index], "30"),
                  borderColor: alpha(activeSlide.accentGradient[index], "48"),
                },
              ]}
            >
              <Icon name={iconName} size={18} color="#F7FBFF" />
            </View>
          ))}
          <LinearGradient
            colors={[
              alpha(activeSlide.accentGradient[0], "FA"),
              alpha(activeSlide.accentGradient[1], "E6"),
            ]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.heroBadge}
          >
            <LinearGradient
              colors={[alpha(activeSlide.iconGradient[0], "22"), alpha(activeSlide.iconGradient[1], "22")]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconPlate}
            >
              <Icon name={activeSlide.icon} size={72} color="#F7FBFF" />
            </LinearGradient>
          </LinearGradient>
        </View>
      </View>

      <View style={styles.copyBlock}>
        <Text style={[styles.eyebrow, { color: activeSlide.accentGradient[0] }]}>{activeSlide.eyebrow}</Text>
        <Text style={styles.slideTitle}>{activeSlide.title}</Text>
        <Text style={styles.slideBody}>{activeSlide.body}</Text>
        <View style={styles.highlightRow}>
          {activeSlide.highlights.map((highlight) => (
            <View
              key={highlight}
              style={[
                styles.highlightChip,
                {
                  borderColor: alpha(activeSlide.accentGradient[0], "46"),
                  backgroundColor: alpha(activeSlide.accentGradient[0], "14"),
                },
              ]}
            >
              <Text style={styles.highlightChipText}>{highlight}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.bottomArea}>
        <View style={styles.progressRow}>
          {GUEST_SLIDES.map((slide, index) => (
            <View
              key={slide.title}
              style={[styles.progressDot, index === slideIndex ? styles.progressDotActive : null]}
            />
          ))}
        </View>

        {showGuestIntro ? (
          <View style={styles.actionRow}>
            <Pressable style={styles.ghostButton} onPress={handleSkip}>
              <Text style={styles.ghostButtonText}>Skip</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleNext}>
              <LinearGradient
                colors={activeSlide.accentGradient as unknown as string[]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryButtonFill}
              >
                <Text style={styles.primaryButtonText}>
                  {slideIndex === GUEST_SLIDES.length - 1 ? "Start" : "Next"}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05070D",
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 26,
    justifyContent: "space-between",
  },
  heroSection: {
    alignItems: "center",
    marginTop: 4,
  },
  heroShell: {
    alignSelf: "center",
    width: "164%",
    aspectRatio: 1.28,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    overflow: "hidden",
    shadowOpacity: 0.28,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  heroOrb: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroShade: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  sparkleCluster: {
    position: "absolute",
    top: 40,
    width: 54,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  sparkleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  heroCore: {
    position: "absolute",
    top: 78,
    width: 176,
    height: 176,
    borderRadius: 88,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  heroCoreGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 88,
  },
  heroBadge: {
    width: 106,
    height: 106,
    borderRadius: 53,
    alignItems: "center",
    justifyContent: "center",
  },
  heroIconPlate: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  copyBlock: {
    paddingHorizontal: 4,
    marginTop: -10,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appFonts.semibold,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  slideTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 34,
    fontFamily: appFonts.bold,
    letterSpacing: -0.4,
    maxWidth: 300,
  },
  slideBody: {
    marginTop: 12,
    color: "rgba(255,255,255,0.62)",
    fontSize: 15,
    lineHeight: 22,
    fontFamily: appFonts.medium,
    maxWidth: 314,
  },
  highlightRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 18,
    gap: 10,
  },
  highlightChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  highlightChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: appFonts.semibold,
    letterSpacing: 0.2,
  },
  bottomArea: {
    width: "100%",
    alignItems: "center",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 7,
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  progressDotActive: {
    backgroundColor: "#FFFFFF",
  },
  actionRow: {
    width: "100%",
    flexDirection: "row",
    marginTop: 22,
    gap: 12,
  },
  ghostButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButtonText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    fontFamily: appFonts.semibold,
  },
  primaryButton: {
    flex: 1.15,
    minHeight: 48,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonFill: {
    width: "100%",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: appFonts.bold,
  },
  heroOrbitBadge: {
    position: "absolute",
    top: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  heroOrbitBadgeLeft: {
    left: 8,
  },
  heroOrbitBadgeRight: {
    right: 8,
  },
});
