import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Platform,
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
const SPLASH_WATERMARK = require("../../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png");
const SPLASH_BUTTON_FONT = Platform.select({
  ios: "SF Pro Display",
  android: "sans-serif-medium",
  default: appFonts.semibold,
}) as string;
const SPLASH_BUTTON_FONT_BOLD = Platform.select({
  ios: "SF Pro Display",
  android: "sans-serif-bold",
  default: appFonts.bold,
}) as string;

const GUEST_SLIDES = [
  {
    eyebrow: "Everything in one app",
    title: "Aline2 Present",
    body: "Trusted social, creator, and service connections in one premium place with a calmer, richer first look.",
    icon: "sparkles-outline",
    useLogo: true,
    orbitIcons: ["people-outline", "shield-checkmark-outline"],
    highlights: ["Trusted", "Premium", "Connected"],
    shellGradient: ["#06111D", "#091829", "#07111B"],
    orbGradient: ["#0A2237", "#0F4A74", "#08131F"],
    iconGradient: ["#F5FCFF", "#BFEFFF"],
    accentGradient: ["#BB30EB", "#BB30EB"],
    haloColor: "rgba(18,131,255,0.24)",
  },
  {
    eyebrow: "Communities that feel alive",
    title: "Connect with friends and influencers",
    body: "Build identity, discover people, and stay close to your favorite communities with a brighter social vibe.",
    icon: "people-outline",
    useLogo: false,
    orbitIcons: ["chatbubbles-outline", "heart-outline"],
    highlights: ["Friends", "Creators", "Chats"],
    shellGradient: ["#07111D", "#0A1727", "#06111B"],
    orbGradient: ["#0A2339", "#116386", "#09131F"],
    iconGradient: ["#C9F5FF", "#9ED8FF"],
    accentGradient: ["#1FD3FF", "#11A5FF"],
    haloColor: "rgba(17,165,255,0.22)",
  },
  {
    eyebrow: "Grow your service business",
    title: "Become a seller and get appointments",
    body: "Turn your services into bookings, seller chats, and appointment growth inside Aline2 with a more professional vibe.",
    icon: "storefront-outline",
    useLogo: false,
    orbitIcons: ["calendar-outline", "cash-outline"],
    highlights: ["Bookings", "Clients", "Growth"],
    shellGradient: ["#06101B", "#0B1727", "#07111A"],
    orbGradient: ["#0A2034", "#0F557E", "#09131E"],
    iconGradient: ["#B9F3FF", "#7FD5FF"],
    accentGradient: ["#22DBFF", "#0F8CFF"],
    haloColor: "rgba(15,140,255,0.2)",
  },
] as const;

const SplashScreen = ({ navigation }: any) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [showGuestIntro, setShowGuestIntro] = useState(false);
  const timeoutHandlesRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const slideTranslateX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;
  const isTransitioningRef = useRef(false);

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

  const animateToSlide = useCallback((nextIndex: number, direction: "next" | "previous") => {
    if (isTransitioningRef.current || nextIndex === slideIndex) {
      return;
    }

    isTransitioningRef.current = true;
    const exitOffset = direction === "next" ? -54 : 54;
    const enterOffset = direction === "next" ? 54 : -54;

    Animated.parallel([
      Animated.timing(slideTranslateX, {
        toValue: exitOffset,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(slideOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSlideIndex(nextIndex);
      slideTranslateX.setValue(enterOffset);
      slideOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(slideTranslateX, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(slideOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isTransitioningRef.current = false;
      });
    });
  }, [slideIndex, slideOpacity, slideTranslateX]);

  const handleNext = useCallback(() => {
    if (slideIndex >= GUEST_SLIDES.length - 1) {
      navigateGuestToLogin().catch(() => {
        navigation.replace("Login");
      });
      return;
    }

    animateToSlide(Math.min(slideIndex + 1, GUEST_SLIDES.length - 1), "next");
  }, [animateToSlide, navigation, navigateGuestToLogin, slideIndex]);

  const handleSkip = () => {
    navigateGuestToLogin().catch(() => {
      navigation.replace("Login");
    });
  };

  const handleSwipeAdvance = useCallback((direction: "next" | "previous") => {
    if (!showGuestIntro) {
      return;
    }

    if (direction === "next") {
      if (slideIndex >= GUEST_SLIDES.length - 1) {
        handleNext();
        return;
      }

      animateToSlide(Math.min(slideIndex + 1, GUEST_SLIDES.length - 1), "next");
      return;
    }

    animateToSlide(Math.max(slideIndex - 1, 0), "previous");
  }, [animateToSlide, handleNext, showGuestIntro, slideIndex]);

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          showGuestIntro
          && Math.abs(gestureState.dx) > 18
          && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dx <= -42) {
            handleSwipeAdvance("next");
            return;
          }

          if (gestureState.dx >= 42) {
            handleSwipeAdvance("previous");
          }
        },
      }),
    [handleSwipeAdvance, showGuestIntro],
  );

  return (
    <LinearGradient
      colors={activeSlide.shellGradient as unknown as string[]}
      style={styles.container}
      {...(showGuestIntro ? swipeResponder.panHandlers : {})}
    >
      <StatusBar backgroundColor="#05070D" barStyle="light-content" />
      <Image source={SPLASH_WATERMARK} resizeMode="contain" style={styles.backgroundWatermark} />
      <View style={styles.backgroundVeil} />

      <Animated.View
        style={[
          styles.slideContent,
          {
            opacity: slideOpacity,
            transform: [{ translateX: slideTranslateX }],
          },
        ]}
      >
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
              {activeSlide.useLogo ? (
                <Image source={SPLASH_WATERMARK} resizeMode="contain" style={styles.heroLogo} />
              ) : (
                <Icon name={activeSlide.icon} size={72} color="#F7FBFF" />
              )}
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
            <Pressable
              style={[
                styles.ghostButton,
                {
                  borderColor: alpha(activeSlide.accentGradient[0], "36"),
                  backgroundColor: alpha(activeSlide.accentGradient[0], "10"),
                },
              ]}
              onPress={handleSkip}
            >
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
      </Animated.View>
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
  backgroundWatermark: {
    position: "absolute",
    right: -34,
    bottom: 92,
    width: 320,
    height: 320,
    opacity: 0.09,
    transform: [{ rotate: "-16deg" }],
  },
  backgroundVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,8,15,0.16)",
  },
  slideContent: {
    flex: 1,
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
  heroLogo: {
    width: 74,
    height: 74,
    borderRadius: 37,
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
    fontFamily: SPLASH_BUTTON_FONT,
    letterSpacing: -0.2,
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
    fontFamily: SPLASH_BUTTON_FONT_BOLD,
    letterSpacing: -0.24,
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
