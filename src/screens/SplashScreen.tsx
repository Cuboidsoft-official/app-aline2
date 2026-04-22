import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";

import { API } from "../api/api";
import { clearStoredSession, getStoredToken } from "../utils/authSession";
import { alpha, appFonts, appShadows } from "../theme/designSystem";

const LOGO_URI = "https://aline2.com/asstes/images/logo/logo.jpeg";
const GUEST_ONBOARDING_KEY = "aline2_guest_intro_seen";
const GUEST_SLIDES = [
  {
    eyebrow: "Welcome",
    title: "Aline2 presents",
    body: "A social world for people, creators, and trusted service sellers in one place.",
    icon: "sparkles-outline",
  },
  {
    eyebrow: "Social",
    title: "Connect with friends and influencers",
    body: "Follow conversations, discover fresh voices, and stay close to the people you care about.",
    icon: "people-outline",
  },
  {
    eyebrow: "Seller",
    title: "Become a seller and get appointments",
    body: "Offer your services, book requests, and grow a premium appointment flow inside the app.",
    icon: "briefcase-outline",
  },
] as const;

const SOCIAL_BADGES: Array<{
  label: string;
  color: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
}> = [
  { label: "Friends", color: "#4FD1C5", top: 108, left: 24 },
  { label: "Influencers", color: "#F6AD55", top: 176, right: 22 },
  { label: "Appointments", color: "#9F7AEA", bottom: 210, left: 28 },
  { label: "Seller chat", color: "#60A5FA", bottom: 138, right: 26 },
];

const SplashScreen = ({ navigation }: any) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [showGuestIntro, setShowGuestIntro] = useState(false);
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(18)).current;
  const badgeFloat = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
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

  const animateSlideCopy = useCallback(() => {
    heroOpacity.setValue(0);
    heroTranslateY.setValue(16);

    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(heroTranslateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroOpacity, heroTranslateY]);

  const runGuestIntro = useCallback(async () => {
    setShowGuestIntro(true);
    setSlideIndex(0);
    animateSlideCopy();

    clearScheduledTimers();

    GUEST_SLIDES.slice(1).forEach((_, index) => {
      const handle = setTimeout(() => {
        setSlideIndex(index + 1);
      }, 1200 * (index + 1));
      timeoutHandlesRef.current.push(handle);
    });

    const finishHandle = setTimeout(() => {
      navigateGuestToLogin().catch(() => {
        navigation.replace("Login");
      });
    }, 1200 * GUEST_SLIDES.length + 380);
    timeoutHandlesRef.current.push(finishHandle);
  }, [animateSlideCopy, navigateGuestToLogin, navigation]);

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
      }, 1500);
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
    }, 1500);

    timeoutHandlesRef.current.push(authHandle);
  }, [navigation, runGuestIntro]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 58,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(badgeFloat, {
            toValue: 1,
            duration: 2800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(badgeFloat, {
            toValue: 0,
            duration: 2800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 2200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();

    checkLaunchState().catch(() => {
      navigation.replace("Login");
    });

    return () => {
      clearScheduledTimers();
    };
  }, [badgeFloat, checkLaunchState, logoScale, navigation, pulseAnim]);

  useEffect(() => {
    if (!showGuestIntro) {
      return;
    }

    animateSlideCopy();
  }, [animateSlideCopy, showGuestIntro, slideIndex]);

  const badgeTranslateY = badgeFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [10, -10],
  });

  const glowScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#041421" barStyle="light-content" />

      <Image source={{ uri: LOGO_URI }} style={styles.backgroundImage} blurRadius={32} />
      <View style={styles.backgroundOverlay} />

      <Animated.View
        style={[
          styles.orb,
          styles.orbPrimary,
          {
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          styles.orbSecondary,
          {
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      <View style={styles.socialBackdrop}>
        {SOCIAL_BADGES.map((badge, index) => (
          <Animated.View
            key={badge.label}
            style={[
              styles.socialBadge,
              {
                backgroundColor: alpha(badge.color, "26"),
                borderColor: alpha(badge.color, "4F"),
                transform: [{ translateY: Animated.add(badgeTranslateY, new Animated.Value(index * 2)) }],
                top: badge.top,
                left: badge.left,
                right: badge.right,
                bottom: badge.bottom,
              },
            ]}
          >
            <Image source={{ uri: LOGO_URI }} style={styles.socialBadgeAvatar} />
            <Text style={styles.socialBadgeText}>{badge.label}</Text>
          </Animated.View>
        ))}
      </View>

      <Animated.View
        style={[
          styles.logoWrap,
          {
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <Image source={{ uri: LOGO_URI }} style={styles.logo} />
      </Animated.View>

      <Animated.View
        style={[
          styles.copyCard,
          {
            opacity: heroOpacity,
            transform: [{ translateY: heroTranslateY }],
          },
        ]}
      >
        <View style={styles.copyHeader}>
          <View style={styles.copyIconWrap}>
            <Icon name={activeSlide.icon} size={18} color="#F7FAFF" />
          </View>
          <Text style={styles.copyEyebrow}>{activeSlide.eyebrow}</Text>
        </View>

        <Text style={styles.title}>Aline2</Text>
        <Text style={styles.slideTitle}>{activeSlide.title}</Text>
        <Text style={styles.slideBody}>{activeSlide.body}</Text>

        <View style={styles.progressRow}>
          {GUEST_SLIDES.map((slide, index) => (
            <View
              key={slide.title}
              style={[
                styles.progressDot,
                index === slideIndex ? styles.progressDotActive : null,
              ]}
            />
          ))}
        </View>
      </Animated.View>

      <Text style={styles.footer}>
        {showGuestIntro ? `Step ${slideIndex + 1} of ${GUEST_SLIDES.length}` : "Powered by Aline2"}
      </Text>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#041421",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,20,33,0.88)",
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbPrimary: {
    width: 280,
    height: 280,
    top: -46,
    right: -86,
    backgroundColor: "rgba(12,145,227,0.16)",
  },
  orbSecondary: {
    width: 220,
    height: 220,
    bottom: 72,
    left: -60,
    backgroundColor: "rgba(171,42,235,0.14)",
  },
  socialBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  socialBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...appShadows.card,
  },
  socialBadgeAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  socialBadgeText: {
    color: "#F6F8FC",
    fontSize: 12,
    fontFamily: appFonts.semibold,
  },
  logoWrap: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    marginBottom: 24,
  },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
  },
  copyCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 22,
    backgroundColor: "rgba(10, 24, 41, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    ...appShadows.card,
  },
  copyHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  copyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    marginRight: 10,
  },
  copyEyebrow: {
    color: "#8BC7FF",
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: appFonts.semibold,
  },
  title: {
    marginTop: 16,
    fontSize: 34,
    color: "#FFFFFF",
    fontFamily: appFonts.bold,
    letterSpacing: 1.2,
  },
  slideTitle: {
    marginTop: 10,
    fontSize: 21,
    lineHeight: 28,
    color: "#F7FAFF",
    fontFamily: appFonts.bold,
  },
  slideBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    color: "#9DB2CB",
    fontFamily: appFonts.regular,
  },
  progressRow: {
    flexDirection: "row",
    marginTop: 18,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginRight: 8,
  },
  progressDotActive: {
    width: 26,
    backgroundColor: "#9B4DFF",
  },
  footer: {
    position: "absolute",
    bottom: 32,
    color: "#7E91AB",
    fontSize: 12,
    fontFamily: appFonts.medium,
  },
});
