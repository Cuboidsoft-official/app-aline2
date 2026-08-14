import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import { Alert } from "../utils/appAlert";
import { SafeAreaView } from "react-native-safe-area-context";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
  type DocumentPickerResponse,
} from "@react-native-documents/picker";
import Icon from "react-native-vector-icons/Ionicons";
import { API } from "../api/api";
import { getReadableApiErrorMessage } from "../api/networkErrors";
import { uploadDocumentAsset, uploadImageAsset } from "../utils/uploadMedia";
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from "../constants/defaultAssets";
import { useAppTheme } from "../theme/AppThemeContext";
import { ensureCameraPermission, ensureMicrophonePermission } from "../utils/permissions";
import { createManagedSound, type ManagedNitroSound } from "../utils/nitroSound";
import { openRazorpayCheckout } from "../utils/razorpayCheckout";
import { getStoredRefreshToken, getStoredSessionMeta, getStoredToken, getStoredUser, setStoredSession } from "../utils/authSession";

const DEFAULT_COVER = DEFAULT_COVER_URL;
const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;
const TOTAL_STEPS = 7;
const SELLER_TERMS_VERSION = "seller_terms_v2";
const VOICE_VERIFICATION_PHRASE =
  "I want to become a seller on Aline2, so I am uploading my voice verification.";
const SELLER_TERMS_PARAGRAPHS = [
  "By registering as a seller on Aline2, I confirm that I am joining this platform by my own consent, with a clear understanding of the responsibilities that come with offering paid services, chats, calls, promotions, consultations, or any other seller activity through my account. I understand that my seller profile represents me, and I agree to use Aline2 in a respectful, lawful, professional, and honest manner.",
  "I agree that I will not misbehave with any buyer, user, customer, company, creator, or Aline2 team member. Misbehavior includes rude, abusive, threatening, insulting, manipulative, discriminatory, or unsafe conduct in chat, call, video, booking, promotion, or any other interaction. I also agree that I will not sexually harass anyone, make sexual comments or requests, pressure anyone for personal contact, send inappropriate content, or behave in any way that makes another person uncomfortable, unsafe, or disrespected.",
  "I understand that if a buyer reports misbehavior, harassment, unsafe conduct, fake identity, misleading service delivery, or any violation from my side, Aline2 may review the case and the buyer may receive a refund, depending on the situation and available evidence. I also understand that my seller account may be limited, suspended, removed, or sent for further review if my conduct harms buyers, users, or the trust of the platform.",
  "I agree that I will personally provide the service, conversation, chat, call, consultation, promotion, or seller interaction that the buyer has paid for. If I make someone else talk, chat, call, appear, or provide the service on my behalf without clear permission from Aline2 and the buyer, the buyer may receive a refund and my seller account may be restricted. I understand that buyers are paying for the seller profile they selected, and replacing myself with another person can be treated as a violation of trust.",
  "I confirm that I have read these terms carefully, I accept them freely, and I am here with my own consent. By tapping accept, I sign and agree that these seller terms apply to my seller account, my services, my chats, my calls, my promotions, and my behavior on Aline2.",
];
const SELLER_TERMS_CONTENT = SELLER_TERMS_PARAGRAPHS.join("\n\n");

const SPECIALIZATION_OPTIONS = [
  "Doctor",
  "Lawyer",
  "Engineer",
  "CA",
  "ICS",
  "Other",
];

const OTHER_SPECIALIZATION_SUGGESTIONS = [
  "Creator",
  "Business",
  "Coach",
  "Consultant",
  "Trainer",
];

const PLAN_OPTIONS = [
  {
    key: "PLAN_100",
    title: "INR 100",
    amount: 100,
    maxHourlyRate: 1000,
    description: "1 hour / INR 1000 you can charge.",
  },
  {
    key: "PLAN_200",
    title: "INR 200",
    amount: 200,
    maxHourlyRate: 2000,
    description: "1 hour / INR 2000 you can charge.",
  },
  {
    key: "PLAN_300",
    title: "INR 300",
    amount: 300,
    maxHourlyRate: 3000,
    description: "1 hour / INR 3000 you can charge.",
  },
  {
    key: "PLAN_400",
    title: "INR 400",
    amount: 400,
    maxHourlyRate: 4000,
    description: "1 hour / INR 4000 you can charge.",
  },
  {
    key: "PLAN_600",
    title: "INR 600",
    amount: 600,
    maxHourlyRate: 6000,
    description: "1 hour / INR 6000 you can charge.",
  },
  {
    key: "PLAN_6000",
    title: "INR 6000",
    amount: 6000,
    maxHourlyRate: 999999,
    description: "Unlimited hourly charge plan.",
  },
] as const;

const EXPERIENCE_OPTIONS = ["0-1 years", "2-5 years", "5-10 years", "10+ years"];
const DEGREE_OPTIONS = [
  "MBBS",
  "MD",
  "LLB",
  "CA",
  "B.Com",
  "MBA",
  "Certified Coach",
  "Certified Trainer",
  "Other",
];
const CERTIFICATE_OPTIONS = [
  "Board Certified",
  "Government Registered",
  "Licensed Professional",
  "Certified Practitioner",
  "Independent Professional",
  "Other",
];
const DURATION_OPTIONS = ["15", "30", "45", "60"];

type PlanKey = typeof PLAN_OPTIONS[number]["key"];
type SellerRegistrationMode = "create" | "edit";
type DropdownField = "specialization" | "experience" | "degree" | "certificate" | "duration";

type DocumentFile = {
  uri: string;
  name?: string | null;
  type?: string | null;
};

type ImageFile = DocumentFile;

type SellerProfileResponse = {
  sellerName?: string;
  specialization?: string;
  bio?: string;
  referralCodeUsed?: string;
  experience?: string;
  degree?: string;
  certificateType?: string;
  registrationNumber?: string;
  identityDocType?: string;
  aadhaar?: string;
  passportNumber?: string;
  pan?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  premiumPlan?: PlanKey;
  subscriptionPlan?: {
    code?: PlanKey;
    amount?: number;
    maxServiceLimit?: number;
    isUnlimited?: boolean;
  };
  onboardingCompleted?: boolean;
  onboardingServiceName?: string;
  onboardingServiceDurationMinutes?: number | string;
  onboardingServiceRate?: number | string;
  promotionPricing?: {
    post?: number | string;
    story?: number | string;
    reel?: number | string;
  };
  durationRates?: {
    rate1Min?: number | string;
    rate15Min?: number | string;
    rate30Min?: number | string;
    rate1Hour?: number | string;
  };
  extraPricing?: {
    messagePrice?: number | string;
    audioCallPrice?: number | string;
    videoCallPrice?: number | string;
  };
  termsAccepted?: boolean;
  termsVersion?: string;
  termsAcceptedAt?: string;
  termsContentSnapshot?: string;
  degreeDoc?: string;
  licenseDoc?: string;
  aadhaarDoc?: string;
  idProofFront?: string;
  idProofBack?: string;
  panDoc?: string;
  idProof?: string;
  voiceVerificationDoc?: string;
  faceCheckDoc?: string;
  profilePic?: string;
  coverPic?: string;
  degreeChecked?: boolean;
  kycChecked?: boolean;
  faceChecked?: boolean;
};

const toDocumentFile = (uri?: string): DocumentFile | null =>
  uri ? { uri, name: uri.split("/").pop() || "document" } : null;

const isRemoteUri = (uri?: string | null) => /^https?:\/\//i.test(String(uri || ""));

const getDocumentPickerMessage = (error: unknown): string => {
  if (!isErrorWithCode(error)) {
    return "Document pick failed";
  }

  switch (error.code) {
    case errorCodes.OPERATION_CANCELED:
      return "";
    case errorCodes.IN_PROGRESS:
      return "The document picker is already open. Close it and try again.";
    case errorCodes.NULL_PRESENTER:
      return "Could not open the document picker right now. Try again in a moment.";
    case errorCodes.UNABLE_TO_OPEN_FILE_TYPE:
      return "This device could not open a picker for images or PDFs.";
    default:
      return error.message || "Document pick failed";
  }
};

const SellerRegistration = ({ navigation, route }: any) => {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const mode: SellerRegistrationMode = route?.params?.mode === "edit" ? "edit" : "create";
  const requestedInitialStep = Math.min(TOTAL_STEPS, Math.max(1, Number(route?.params?.initialStep) || 1));

  const [step, setStep] = useState(requestedInitialStep);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(mode === "edit");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeDropdown, setActiveDropdown] = useState<DropdownField | null>(null);
  const [termsVisible, setTermsVisible] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState("");
  const [subscriptionProcessing, setSubscriptionProcessing] = useState(false);

  const [name, setName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [customSpecialization, setCustomSpecialization] = useState("");
  const [bio, setBio] = useState("");

  const [avatar, setAvatar] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<ImageFile | null>(null);
  const [coverFile, setCoverFile] = useState<ImageFile | null>(null);

  const [premiumPlan, setPremiumPlan] = useState<PlanKey>("PLAN_100");
  const [referralCode, setReferralCode] = useState("");

  const [experience, setExperience] = useState("");
  const [degree, setDegree] = useState("");
  const [certificateType, setCertificateType] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [degreeDoc, setDegreeDoc] = useState<DocumentFile | null>(null);
  const [licenseDoc, setLicenseDoc] = useState<DocumentFile | null>(null);
  const [degreeChecked, setDegreeChecked] = useState(false);

  const [identityDocType, setIdentityDocType] = useState<"Aadhaar" | "Passport">("Aadhaar");
  const [passportNumber, setPassportNumber] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [aadhaarDoc, setAadhaarDoc] = useState<DocumentFile | null>(null);
  const [idProofFront, setIdProofFront] = useState<DocumentFile | null>(null);
  const [idProofBack, setIdProofBack] = useState<DocumentFile | null>(null);
  const [panDoc, setPanDoc] = useState<DocumentFile | null>(null);
  const [idProof, setIdProof] = useState<DocumentFile | null>(null);
  const [voiceDoc, setVoiceDoc] = useState<DocumentFile | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const managedSoundRef = React.useRef<ManagedNitroSound | null>(null);
  const [kycChecked, setKycChecked] = useState(false);

  const [faceCheckPreview, setFaceCheckPreview] = useState<string | null>(null);
  const [faceCheckDoc, setFaceCheckDoc] = useState<ImageFile | null>(null);
  const [faceChecked, setFaceChecked] = useState(false);
  const [faceCaptureLoading, setFaceCaptureLoading] = useState(false);
  const [faceCaptureError, setFaceCaptureError] = useState("");

  const [serviceName, setServiceName] = useState("");
  const [serviceDurationMinutes, setServiceDurationMinutes] = useState("15");
  const [serviceRate, setServiceRate] = useState("");
  const [rate1Min, setRate1Min] = useState("");
  const [rate15Min, setRate15Min] = useState("");
  const [rate30Min, setRate30Min] = useState("");
  const [rate1Hour, setRate1Hour] = useState("");
  const [messagePrice, setMessagePrice] = useState("");
  const [audioCallPrice, setAudioCallPrice] = useState("");
  const [videoCallPrice, setVideoCallPrice] = useState("");
  const [promotionPostPrice, setPromotionPostPrice] = useState("");
  const [promotionStoryPrice, setPromotionStoryPrice] = useState("");
  const [promotionReelPrice, setPromotionReelPrice] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(mode === "edit");

  const selectedPlan = useMemo(
    () => PLAN_OPTIONS.find((plan) => plan.key === premiumPlan) || PLAN_OPTIONS[0],
    [premiumPlan],
  );
  const durationMinutes = Number(serviceDurationMinutes) || 0;
  const rateLimit = Math.floor((selectedPlan.maxHourlyRate * durationMinutes) / 60);
  const rateLimit15Min = Math.floor((selectedPlan.maxHourlyRate * 15) / 60);
  const rateLimit1Min = rateLimit15Min;
  const rateLimit30Min = Math.floor((selectedPlan.maxHourlyRate * 30) / 60);
  const rateLimit1Hour = selectedPlan.maxHourlyRate;
  const specializationValue = specialization === "Other" ? customSpecialization.trim() : specialization;
  const areProfessionalDetailsOptional = specialization === "Other";

  const hydrateSellerProfile = useCallback((seller: SellerProfileResponse) => {
    setName(seller?.sellerName || "");
    setSpecialization(
      seller?.specialization && SPECIALIZATION_OPTIONS.includes(seller.specialization)
        ? seller.specialization
        : seller?.specialization
          ? "Other"
          : "",
    );
    setCustomSpecialization(
      seller?.specialization && !SPECIALIZATION_OPTIONS.includes(seller.specialization)
        ? seller.specialization
        : "",
    );
    setBio(seller?.bio || "");
    setReferralCode(String(seller?.referralCodeUsed || "").trim().toUpperCase());
    setAvatar(seller?.profilePic || null);
    setCover(seller?.coverPic || null);
    setPremiumPlan(seller?.subscriptionPlan?.code || seller?.premiumPlan || "PLAN_100");
    setPaymentVerified(Boolean(mode === "edit" && seller?.onboardingCompleted));
    setSubscriptionId("");
    setExperience(seller?.experience || "");
    setDegree(seller?.degree || "");
    setCertificateType(seller?.certificateType || "");
    setRegistrationNumber(seller?.registrationNumber || "");
    setDegreeDoc(toDocumentFile(seller?.degreeDoc));
    setLicenseDoc(toDocumentFile(seller?.licenseDoc));
    setDegreeChecked(Boolean(seller?.degreeChecked || seller?.degreeDoc));
    setIdentityDocType(seller?.identityDocType === "Passport" ? "Passport" : "Aadhaar");
    setPassportNumber(seller?.passportNumber || "");
    setAadhaar(seller?.aadhaar || "");
    setPan(seller?.pan || "");
    setBankAccountName(seller?.bankAccountName || "");
    setBankAccountNumber(seller?.bankAccountNumber || "");
    setBankIfsc(seller?.bankIfsc || "");
    setBankName(seller?.bankName || "");
    const frontDoc = toDocumentFile(seller?.idProofFront || seller?.aadhaarDoc);
    const backDoc = toDocumentFile(seller?.idProofBack || seller?.idProof);
    const voiceFile = toDocumentFile(seller?.voiceVerificationDoc);
    setAadhaarDoc(frontDoc);
    setIdProofFront(frontDoc);
    setIdProof(backDoc);
    setIdProofBack(backDoc);
    setPanDoc(toDocumentFile(seller?.panDoc));
    setVoiceDoc(voiceFile);
    setKycChecked(Boolean(seller?.kycChecked || (frontDoc && backDoc && voiceFile)));
    setFaceCheckPreview(seller?.faceCheckDoc || null);
    setFaceCheckDoc(toDocumentFile(seller?.faceCheckDoc));
    setFaceChecked(Boolean(seller?.faceChecked || seller?.faceCheckDoc));
    setServiceName(seller?.onboardingServiceName || "");
    setServiceDurationMinutes(String(seller?.onboardingServiceDurationMinutes || "15"));
    setServiceRate(String(seller?.onboardingServiceRate || ""));
    setRate1Min(seller?.durationRates?.rate1Min ? String(seller.durationRates.rate1Min) : "");
    setRate15Min(seller?.durationRates?.rate15Min ? String(seller.durationRates.rate15Min) : "");
    setRate30Min(seller?.durationRates?.rate30Min ? String(seller.durationRates.rate30Min) : "");
    setRate1Hour(seller?.durationRates?.rate1Hour ? String(seller.durationRates.rate1Hour) : "");
    setMessagePrice(seller?.extraPricing?.messagePrice ? String(seller.extraPricing.messagePrice) : "");
    setAudioCallPrice(seller?.extraPricing?.audioCallPrice ? String(seller.extraPricing.audioCallPrice) : "");
    setVideoCallPrice(seller?.extraPricing?.videoCallPrice ? String(seller.extraPricing.videoCallPrice) : "");
    setPromotionPostPrice(String(seller?.promotionPricing?.post || ""));
    setPromotionStoryPrice(String(seller?.promotionPricing?.story || ""));
    setPromotionReelPrice(String(seller?.promotionPricing?.reel || ""));
    setTermsAccepted(Boolean(seller?.termsAccepted || mode === "edit"));
  }, [mode]);

  useEffect(() => {
    setStep(requestedInitialStep);
  }, [requestedInitialStep]);

  useEffect(() => {
    let active = true;

    const loadSellerProfile = async () => {
      try {
        if (mode === "edit") {
          setInitializing(true);
        }
        const res = await API.get("/seller/me");

        if (active && res?.data?.seller) {
          hydrateSellerProfile(res.data.seller as SellerProfileResponse);
          setErrorMessage("");
        }
      } catch (error: any) {
        console.log("seller edit load error:", error?.response?.data || error?.message);
        const statusCode = Number(error?.response?.status || 0);
        if (active && !(mode === "create" && statusCode === 404)) {
          setErrorMessage(getReadableApiErrorMessage(error, "Failed to load seller profile."));
        }
      } finally {
        if (active && mode === "edit") {
          setInitializing(false);
        }
      }
    };

    loadSellerProfile();

    return () => {
      active = false;
    };
  }, [hydrateSellerProfile, mode]);

  const pickImage = (
    previewSetter: (value: string | null) => void,
    fileSetter: (value: ImageFile | null) => void,
  ) => {
    launchImageLibrary({ mediaType: "photo" }, response => {
      if (response?.didCancel) return;

      if (response?.errorCode) {
        Alert.alert("Error", "Image pick failed");
        return;
      }

      const asset = response.assets?.[0];
      if (asset?.uri) {
        previewSetter(asset.uri);
        fileSetter({
          uri: asset.uri,
          name: asset.fileName,
          type: asset.type,
        });
      }
    });
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRecordingVoice) {
      interval = setInterval(() => {
        setRecordingTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecordingVoice]);

  useEffect(() => {
    return () => {
      if (managedSoundRef.current) {
        try {
          managedSoundRef.current.dispose();
        } catch {
          // noop
        }
      }
    };
  }, []);

  const startVoiceRecording = useCallback(async () => {
    try {
      const hasPermission = await ensureMicrophonePermission(
        "Allow Aline2 to use your microphone to record your seller voice verification.",
      );

      if (!hasPermission) {
        Alert.alert("Permission required", "Microphone permission is required to record your voice verification.");
        return;
      }

      if (!managedSoundRef.current || managedSoundRef.current.isDisposed()) {
        managedSoundRef.current = createManagedSound();
      }

      const sound = managedSoundRef.current;
      await sound.startRecorder();
      setIsRecordingVoice(true);
      setRecordingTimer(0);
      setKycChecked(false);
    } catch (error: any) {
      console.log("startVoiceRecording error:", error);
      Alert.alert("Recording failed", getReadableApiErrorMessage(error, "Could not start voice recording."));
    }
  }, []);

  const stopVoiceRecording = useCallback(async () => {
    try {
      if (!managedSoundRef.current || !isRecordingVoice) {
        return;
      }

      const recordedUri = await managedSoundRef.current.stopRecorder();
      setIsRecordingVoice(false);

      if (recordedUri) {
        setVoiceDoc({
          uri: recordedUri,
          name: `voice_verification_${Date.now()}.m4a`,
          type: "audio/m4a",
        });
        setKycChecked(false);
      }
    } catch (error: any) {
      console.log("stopVoiceRecording error:", error);
      setIsRecordingVoice(false);
      Alert.alert("Recording error", getReadableApiErrorMessage(error, "Could not save voice recording."));
    }
  }, [isRecordingVoice]);

  const togglePlayVoiceAudio = useCallback(async () => {
    try {
      if (!voiceDoc?.uri) return;

      if (isPlayingVoice) {
        if (managedSoundRef.current) {
          await managedSoundRef.current.stopPlayer();
        }
        setIsPlayingVoice(false);
        return;
      }

      if (!managedSoundRef.current || managedSoundRef.current.isDisposed()) {
        managedSoundRef.current = createManagedSound();
      }

      const sound = managedSoundRef.current;
      sound.addPlaybackEndListener(() => {
        setIsPlayingVoice(false);
      });

      setIsPlayingVoice(true);
      await sound.startPlayer(voiceDoc.uri);
    } catch (error: any) {
      console.log("togglePlayVoiceAudio error:", error);
      setIsPlayingVoice(false);
    }
  }, [isPlayingVoice, voiceDoc?.uri]);

  const normalizePickedDocument = useCallback(async (file: DocumentPickerResponse): Promise<DocumentFile> => {
    const fileName = file.name || `document_${Date.now()}`;

    if (file.isVirtual || String(file.uri || "").startsWith("content://")) {
      const convertVirtualFileToType = file.isVirtual
        ? file.convertibleToMimeTypes?.find((item) => item.mimeType === "application/pdf")?.mimeType ||
          file.convertibleToMimeTypes?.[0]?.mimeType
        : undefined;

      const [localCopy] = await keepLocalCopy({
        destination: "cachesDirectory",
        files: [
          {
            uri: file.uri,
            fileName,
            convertVirtualFileToType,
          },
        ],
      });

      if (!localCopy || localCopy.status !== "success") {
        throw new Error(localCopy?.copyError || "Unable to access the selected document.");
      }

      return {
        uri: localCopy.localUri,
        name: fileName,
        type: file.type,
      };
    }

    return {
      uri: file.uri,
      name: fileName,
      type: file.type,
    };
  }, []);

  const pickVoiceAudio = useCallback(async () => {
    try {
      const [file] = await pick({
        mode: "import",
        allowMultiSelection: false,
        type: [types.audio],
      });

      if (file?.uri) {
        const normalized = await normalizePickedDocument(file);
        setVoiceDoc(normalized);
        setKycChecked(false);
      }
    } catch (error) {
      const message = getDocumentPickerMessage(error);
      if (message) {
        Alert.alert("Error", message);
      }
    }
  }, [normalizePickedDocument]);

  const captureFaceCheck = useCallback(async () => {
    try {
      setFaceCaptureLoading(true);
      setFaceCaptureError("");

      const hasPermission = await ensureCameraPermission(
        "Allow Aline2 to use your camera for your seller verification selfie.",
      );

      if (!hasPermission) {
        const message = "Camera permission is required to take your verification selfie.";
        setFaceCaptureError(message);
        Alert.alert("Camera permission needed", message);
        return;
      }

      const response = await launchCamera({
        mediaType: "photo",
        cameraType: "front",
        saveToPhotos: false,
        quality: 0.9,
      });

      if (response?.didCancel) {
        return;
      }

      if (response?.errorCode) {
        const message = response.errorMessage || "Could not open the selfie camera right now.";
        setFaceCaptureError(message);
        Alert.alert("Face check failed", message);
        return;
      }

      const asset = response.assets?.[0];
      if (!asset?.uri) {
        const message = "The camera did not return a usable selfie image.";
        setFaceCaptureError(message);
        Alert.alert("Face check failed", message);
        return;
      }

      setFaceCheckPreview(asset.uri);
      setFaceCheckDoc({
        uri: asset.uri,
        name: asset.fileName || `face_check_${Date.now()}.jpg`,
        type: asset.type,
      });
      setFaceChecked(true);
      setFaceCaptureError("");
    } catch (error) {
      const message = getReadableApiErrorMessage(error, "Could not open the selfie camera right now.");
      setFaceCaptureError(message);
      Alert.alert("Face check failed", message);
    } finally {
      setFaceCaptureLoading(false);
    }
  }, []);

  const pickDocument = async (setter: (value: DocumentFile | null) => void) => {
    try {
      const [file] = await pick({
        mode: "import",
        allowMultiSelection: false,
        type: [types.allFiles],
      });

      if (!file?.uri) {
        throw new Error("No file was returned by the document picker.");
      }

      if (file.hasRequestedType === false) {
        Alert.alert("Unsupported file", "Please select a supported verification document.");
        return;
      }

      if (file.error) {
        throw new Error(file.error);
      }

      setter(await normalizePickedDocument(file));
    } catch (error) {
      const message = getDocumentPickerMessage(error);

      if (!message) {
        return;
      }

      if (isErrorWithCode(error)) {
        console.log("document picker error:", error.code, error.message);
      } else {
        console.log("document picker error:", error);
      }

      Alert.alert("Error", message);
    }
  };

  const uploadDocumentOrKeep = async (file: DocumentFile | null) => {
    if (!file?.uri) {
      return "";
    }

    if (isRemoteUri(file.uri)) {
      return file.uri;
    }

    return uploadDocumentAsset(file);
  };

  const uploadImageOrKeep = async (file: ImageFile | null, existingUri: string | null) => {
    if (file?.uri && !isRemoteUri(file.uri)) {
      return uploadImageAsset(file);
    }

    return existingUri || file?.uri || "";
  };

  const getDropdownMeta = () => {
    switch (activeDropdown) {
      case "specialization":
        return { title: "Select specialization", options: SPECIALIZATION_OPTIONS };
      case "experience":
        return { title: "Select experience", options: EXPERIENCE_OPTIONS };
      case "degree":
        return { title: "Select degree", options: DEGREE_OPTIONS };
      case "certificate":
        return { title: "Select certificate type", options: CERTIFICATE_OPTIONS };
      case "duration":
        return { title: "Select duration", options: DURATION_OPTIONS };
      default:
        return { title: "", options: [] as string[] };
    }
  };

  const applyDropdownValue = (value: string) => {
    switch (activeDropdown) {
      case "specialization":
        setSpecialization(value);
        if (value !== "Other") {
          setCustomSpecialization("");
        }
        break;
      case "experience":
        setExperience(value);
        break;
      case "degree":
        setDegree(value);
        setDegreeChecked(false);
        break;
      case "certificate":
        setCertificateType(value);
        setDegreeChecked(false);
        break;
      case "duration":
        setServiceDurationMinutes(value);
        break;
      default:
        break;
    }

    setActiveDropdown(null);
  };

  const handleDegreeCheck = () => {
    if (areProfessionalDetailsOptional) {
      setDegreeChecked(true);
      Alert.alert("Optional", "Professional documents are optional for Other specialization.");
      return;
    }

    if (!degree || !certificateType || !registrationNumber.trim() || !degreeDoc || !licenseDoc) {
      Alert.alert("Professional details", "Complete the dropdowns, registration number, and uploads first.");
      return;
    }

    setDegreeChecked(true);
    Alert.alert("Checked", "Professional details are ready for review.");
  };

  const handleKycCheck = () => {
    const docNumber = identityDocType === "Passport" ? passportNumber.trim() : aadhaar.trim();
    const docName = identityDocType === "Passport" ? "Passport" : "Aadhaar card";
    const frontPhoto = idProofFront || aadhaarDoc;
    const backPhoto = idProofBack || idProof;

    if (!docNumber) {
      Alert.alert("Identity check", `Please enter your ${docName} number.`);
      return;
    }
    if (!frontPhoto) {
      Alert.alert("Identity check", `Please upload the Front side photo of your ${docName}.`);
      return;
    }
    if (!backPhoto) {
      Alert.alert("Identity check", `Please upload the Back side photo of your ${docName}.`);
      return;
    }
    if (!voiceDoc) {
      Alert.alert("Identity check", "Please record or upload your voice verification statement.");
      return;
    }

    setKycChecked(true);
    Alert.alert("Checked", "Identity details are ready for review.");
  };

  const validateCurrentStep = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert("Validation", "Please enter seller name.");
        return false;
      }
      if (!specializationValue) {
        Alert.alert("Validation", "Please select specialization.");
        return false;
      }
    }

    if (step === 2) {
      if (!bio.trim()) {
        Alert.alert("Validation", "Please add description.");
        return false;
      }
      if (!paymentVerified) {
        Alert.alert("Payment", "Complete the subscription payment to continue.");
        return false;
      }
    }

    if (step === 3) {
      if (areProfessionalDetailsOptional) {
        return true;
      }

      if (!experience || !degree || !certificateType || !registrationNumber.trim()) {
        Alert.alert("Validation", "Please complete professional details.");
        return false;
      }
      if (!degreeDoc || !licenseDoc) {
        Alert.alert("Validation", "Please upload degree and certificate documents.");
        return false;
      }
      if (!degreeChecked) {
        Alert.alert("Validation", "Tap Check on professional details before continuing.");
        return false;
      }
    }

    if (step === 4) {
      const docNumber = identityDocType === "Passport" ? passportNumber.trim() : aadhaar.trim();
      const docName = identityDocType === "Passport" ? "Passport" : "Aadhaar card";
      const frontPhoto = idProofFront || aadhaarDoc;
      const backPhoto = idProofBack || idProof;

      if (!docNumber) {
        Alert.alert("Validation", `Please enter ${docName} number.`);
        return false;
      }
      if (!frontPhoto) {
        Alert.alert("Validation", `Please upload ${docName} Front side photo.`);
        return false;
      }
      if (!backPhoto) {
        Alert.alert("Validation", `Please upload ${docName} Back side photo.`);
        return false;
      }
      if (!voiceDoc) {
        Alert.alert("Validation", "Please record or upload your voice verification statement.");
        return false;
      }
      if (!kycChecked) {
        Alert.alert("Validation", "Tap Check on Identity details before continuing.");
        return false;
      }
    }

    if (step === 5) {
      if (!faceChecked && !faceCheckDoc && !faceCheckPreview) {
        Alert.alert("Selfie required", "Please take a clear verification selfie before continuing.");
        return false;
      }
    }

    if (step === 6) {
      if (!serviceName.trim()) {
        Alert.alert("Validation", "Please enter service name.");
        return false;
      }

      const r1 = Number(rate1Min) || 0;
      if (r1 <= 0 || r1 > rateLimit1Min) {
        Alert.alert("Validation", `Please enter a valid rate for 1 min duration (Max allowed INR ${rateLimit1Min}).`);
        return false;
      }

      const r15 = Number(rate15Min) || 0;
      if (r15 <= 0 || r15 > rateLimit15Min) {
        Alert.alert("Validation", `Please enter a valid rate for 15 min duration (Max allowed INR ${rateLimit15Min}).`);
        return false;
      }

      const r30 = Number(rate30Min) || 0;
      if (r30 <= 0 || r30 > rateLimit30Min) {
        Alert.alert("Validation", `Please enter a valid rate for 30 min duration (Max allowed INR ${rateLimit30Min}).`);
        return false;
      }

      const r60 = Number(rate1Hour) || 0;
      if (r60 <= 0 || r60 > rateLimit1Hour) {
        Alert.alert("Validation", `Please enter a valid rate for 1 hour duration (Max allowed INR ${rateLimit1Hour}).`);
        return false;
      }
    }

    if (step === 7) {
      if (!termsAccepted) {
        Alert.alert("Terms required", "Please read and accept the seller terms and conditions before finishing.");
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (step === 2 && !paymentVerified) {
      if (!bio.trim()) {
        Alert.alert("Description required", "Please add a description before payment.");
        return;
      }
      startSubscriptionPayment();
      return;
    }

    if (!validateCurrentStep()) return;
    setStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
  };

  const syncSessionCategory = useCallback(async () => {
    const [token, refreshToken, session, storedUser] = await Promise.all([
      getStoredToken(),
      getStoredRefreshToken(),
      getStoredSessionMeta(),
      getStoredUser(),
    ]);

    if (!token) {
      return;
    }

    await setStoredSession({
      accessToken: token,
      refreshToken: refreshToken || undefined,
      session: session || undefined,
      user: {
        ...(storedUser || {}),
        category: "Seller",
        name: name.trim() || storedUser?.name || "",
        profilePic: avatar || storedUser?.profilePic || "",
    coverPic: cover || storedUser?.coverPic || "",
      },
    });
  }, [avatar, cover, name]);

  const startSubscriptionPayment = useCallback(
    async (targetPlanKey?: string) => {
      const planCodeToUse = (targetPlanKey as PlanKey) || premiumPlan;
      const targetPlanObj = PLAN_OPTIONS.find((plan) => plan.key === planCodeToUse) || selectedPlan;

      if (!name.trim()) {
        Alert.alert("Seller name required", "Please enter seller name before payment.");
        return;
      }

      if (!specializationValue) {
        Alert.alert("Specialization required", "Select specialization before plan payment.");
        return;
      }

      if (!bio.trim()) {
        Alert.alert("Description required", "Add a seller description before payment.");
        return;
      }

      setSubscriptionProcessing(true);

      try {
        const orderRes = await API.post("/seller/subscription/order", {
          planCode: planCodeToUse,
          sellerName: name.trim(),
          specialization: specializationValue,
          bio: bio.trim(),
          referralCode: referralCode.trim().toUpperCase(),
        });

        const nextSubscriptionId = String(
          orderRes?.data?.subscription?._id || orderRes?.data?.payment?.subscriptionId || "",
        );
        const paymentPayload = orderRes?.data?.payment;

        if (!paymentPayload || !nextSubscriptionId) {
          throw new Error("Subscription payment could not be prepared.");
        }

        const checkoutResult = await openRazorpayCheckout({
          ...paymentPayload,
          name: "Aline2 Seller Plan",
          description: `${targetPlanObj.title} subscription`,
        });

        await API.post(`/seller/subscription/${nextSubscriptionId}/verify`, checkoutResult);

        setPremiumPlan(planCodeToUse);
        setSubscriptionId(nextSubscriptionId);
        setPaymentVerified(true);
        setErrorMessage("");
        Alert.alert("Payment successful", "Subscription activated. Next step is open now.");
        setStep((prev) => Math.min(TOTAL_STEPS, Math.max(prev + 1, 3)));
      } catch (error: any) {
        setPaymentVerified(false);
        setSubscriptionId("");
        setStep((prev) => Math.min(prev, 2));
        if (error?.code === 0) {
          Alert.alert("Payment cancelled", "Subscription payment was not completed.");
        } else {
          const nextMessage = getReadableApiErrorMessage(error, "Subscription payment failed");
          setErrorMessage(nextMessage);
          Alert.alert("Payment failed", nextMessage);
        }
      } finally {
        setSubscriptionProcessing(false);
      }
    },
    [bio, name, premiumPlan, referralCode, selectedPlan, specializationValue],
  );

  const submitSellerRegistration = async () => {
    try {
      if (!validateCurrentStep()) return;

      setLoading(true);

      const uploadedProfilePic = await uploadImageOrKeep(avatarFile, avatar);
      const uploadedCoverPic = await uploadImageOrKeep(coverFile, cover);
      const uploadedDegreeDoc = await uploadDocumentOrKeep(degreeDoc);
      const uploadedLicenseDoc = await uploadDocumentOrKeep(licenseDoc);
      const uploadedIdProofFront = await uploadDocumentOrKeep(idProofFront || aadhaarDoc);
      const uploadedIdProofBack = await uploadDocumentOrKeep(idProofBack || idProof);
      const uploadedPanDoc = await uploadDocumentOrKeep(panDoc);
      const uploadedVoiceDoc = await uploadDocumentOrKeep(voiceDoc);
      const uploadedFaceCheckDoc = await uploadImageOrKeep(faceCheckDoc, faceCheckPreview);

      const payload = {
        sellerName: name.trim(),
        specialization: specializationValue,
        bio: bio.trim(),
        premiumPlan,
        subscriptionPlanCode: premiumPlan,
        subscriptionId,
        premiumPlanAmount: selectedPlan.amount,
        maxHourlyRate: selectedPlan.maxHourlyRate,
        professionalDetailsOptional: areProfessionalDetailsOptional,
        experience,
        degree,
        certificateType,
        registrationNumber: registrationNumber.trim(),
        identityDocType,
        aadhaar: aadhaar.trim(),
        passportNumber: passportNumber.trim(),
        pan: pan.trim(),
        bankAccountName: bankAccountName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        bankIfsc: bankIfsc.trim().toUpperCase(),
        bankName: bankName.trim(),
        referralCode: referralCode.trim().toUpperCase(),
        degreeDoc: uploadedDegreeDoc,
        licenseDoc: uploadedLicenseDoc,
        aadhaarDoc: uploadedIdProofFront,
        idProofFront: uploadedIdProofFront,
        idProof: uploadedIdProofBack,
        idProofBack: uploadedIdProofBack,
        panDoc: uploadedPanDoc,
        voiceVerificationDoc: uploadedVoiceDoc,
        faceCheckDoc: uploadedFaceCheckDoc,
        profilePic: uploadedProfilePic,
        coverPic: uploadedCoverPic,
        degreeChecked,
        kycChecked,
        faceChecked,
        onboardingServiceName: serviceName.trim(),
        onboardingServiceDurationMinutes: 15,
        onboardingServiceRate: Number(rate15Min) || 0,
        onboardingServiceRateLimit: rateLimit15Min,
        durationRates: {
          rate1Min: Number(rate1Min) || 0,
          rate15Min: Number(rate15Min) || 0,
          rate30Min: Number(rate30Min) || 0,
          rate1Hour: Number(rate1Hour) || 0,
        },
        extraPricing: {
          messagePrice: Number(messagePrice) || 0,
          audioCallPrice: Number(audioCallPrice) || 0,
          videoCallPrice: Number(videoCallPrice) || 0,
        },
        promotionPricing: {
          post: Number(promotionPostPrice) || 0,
          story: Number(promotionStoryPrice) || 0,
          reel: Number(promotionReelPrice) || 0,
        },
        termsAccepted,
        termsVersion: SELLER_TERMS_VERSION,
        termsAcceptedAt: termsAccepted ? new Date().toISOString() : undefined,
        termsContentSnapshot: SELLER_TERMS_CONTENT,
      };

      const endpoint = mode === "edit" ? "/seller/update" : "/seller/register";
      const method = mode === "edit" ? API.put : API.post;
      const res = await method(endpoint, payload);

      if (res?.data?.success) {
        setErrorMessage("");
        await syncSessionCategory();
        Alert.alert("Success", mode === "edit" ? "Seller profile updated." : "Seller profile ready.");
        navigation.replace("SellerDashboardScreen");
      } else {
        const fallbackMessage = mode === "edit" ? "Profile update failed" : "Registration failed";
        setErrorMessage(res?.data?.message || fallbackMessage);
        Alert.alert("Error", res?.data?.message || fallbackMessage);
      }
    } catch (error: any) {
      console.log("seller register error:", error?.response?.data || error.message);
      const nextMessage = getReadableApiErrorMessage(
        error,
        mode === "edit" ? "Seller update failed" : "Seller registration failed",
      );
      setErrorMessage(nextMessage);
      Alert.alert("Error", nextMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderUpload = (
    title: string,
    file: DocumentFile | null,
    setter: (value: DocumentFile | null) => void,
  ) => (
    <View
      style={[styles.uploadBox, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <TouchableOpacity style={styles.uploadInner} onPress={() => pickDocument(setter)} activeOpacity={0.85}>
        <Icon name={file ? "checkmark-circle" : "document-text-outline"} size={22} color={colors.primary} />
        <View style={styles.uploadContent}>
          <Text style={[styles.uploadTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.uploadText, { color: colors.mutedText }]} numberOfLines={1}>
            {file?.name || "Tap to upload"}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.mutedText} />
      </TouchableOpacity>
    </View>
  );

  const renderDropdownField = (
    label: string,
    field: DropdownField,
    value: string,
    placeholder: string,
  ) => (
    <>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TouchableOpacity
        style={[styles.dropdownField, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => setActiveDropdown(field)}
        activeOpacity={0.85}
      >
        <Text style={[styles.dropdownText, { color: value ? colors.text : colors.placeholder }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.mutedText} />
      </TouchableOpacity>
    </>
  );

  const renderStepPills = () => (
    <View style={styles.progressRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, index) => {
        const itemStep = index + 1;
        const isActive = itemStep === step;
        const isDone = itemStep < step;

        return (
          <View
            key={itemStep}
            style={[
              styles.progressPill,
              { backgroundColor: isActive || isDone ? colors.primary : colors.border },
            ]}
          />
        );
      })}
    </View>
  );

  const renderStepContent = () => {
    if (step === 1) {
      return (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Create your seller identity</Text>
          <Text style={[styles.sectionBody, { color: colors.mutedText }]}>
            Buyers will see these details first. A clear photo, clean name, and focused specialization help build trust.
          </Text>

          <View style={[styles.stepIntroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.stepIntroHeader}>
              <View style={[styles.stepIntroIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Icon name="sparkles-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.stepIntroCopy}>
                <Text style={[styles.stepIntroTitle, { color: colors.text }]}>A strong first impression</Text>
                <Text style={[styles.stepIntroBody, { color: colors.mutedText }]}>
                  Keep your profile simple and professional so buyers quickly understand what you offer.
                </Text>
              </View>
            </View>

            <View style={styles.stepTipList}>
              <View style={styles.stepTipRow}>
                <Icon name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={[styles.stepTipText, { color: colors.text }]}>Use a clear face photo</Text>
              </View>
              <View style={styles.stepTipRow}>
                <Icon name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={[styles.stepTipText, { color: colors.text }]}>Use the name you want buyers to see</Text>
              </View>
              <View style={styles.stepTipRow}>
                <Icon name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={[styles.stepTipText, { color: colors.text }]}>Choose one focused specialization</Text>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.mediaSectionCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.mediaSectionHeader}>
              <Text style={[styles.mediaSectionTitle, { color: colors.text }]}>Profile visuals</Text>
              <Text style={[styles.mediaSectionBody, { color: colors.mutedText }]}>
              A profile photo and cover image make the account feel more complete.
              </Text>
            </View>

            <View
              style={[
                styles.mediaCard,
                isCompact && styles.mediaCardCompact,
              ]}
            >
              <View style={[styles.mediaItem, isCompact && styles.mediaItemCompact]}>
                <Text style={[styles.mediaLabel, { color: colors.text }]}>Profile photo</Text>
                <TouchableOpacity
                  style={styles.avatarPicker}
                  onPress={() => pickImage(setAvatar, setAvatarFile)}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: avatar || DEFAULT_AVATAR }} style={styles.avatar} />
                  <View style={styles.avatarBadge}>
                    <Icon name="camera" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
                <Text style={[styles.mediaHint, { color: colors.mutedText }]}>Square photo works best</Text>
              </View>

              <View style={[styles.coverBlock, isCompact && styles.coverBlockCompact]}>
                <Text style={[styles.mediaLabel, { color: colors.text }]}>Cover photo</Text>
                <TouchableOpacity
                  style={[styles.coverPicker, isCompact && styles.coverPickerCompact]}
                  onPress={() => pickImage(setCover, setCoverFile)}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: cover || DEFAULT_COVER }} style={styles.cover} />
                </TouchableOpacity>
                <Text style={[styles.mediaHint, { color: colors.mutedText }]}>Use a clean, brand-friendly image</Text>
              </View>
            </View>
          </View>

          <View style={[styles.formSectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.formSectionTitle, { color: colors.text }]}>Basic details</Text>
            <Text style={[styles.formSectionBody, { color: colors.mutedText }]}>
              This information defines your profile title and category.
            </Text>

            <Text style={[styles.label, { color: colors.text }]}>Seller name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={name}
              onChangeText={setName}
              placeholder="Enter seller name"
              placeholderTextColor={colors.placeholder}
            />
            <Text style={[styles.fieldHint, { color: colors.mutedText }]}>Example: Dr. Riya Sharma, Legal Expert, Fit Coach</Text>

            {renderDropdownField("Specialization", "specialization", specialization, "Select specialization")}

            {specialization === "Other" ? (
              <>
                <Text style={[styles.label, { color: colors.text }]}>Other specialization</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={customSpecialization}
                  onChangeText={setCustomSpecialization}
                  placeholder="Enter or select your specialization"
                  placeholderTextColor={colors.placeholder}
                />
                <Text style={[styles.fieldHint, { color: colors.mutedText, marginTop: -4, marginBottom: 8 }]}>
                  Select a quick option below or type your own custom profession:
                </Text>
                <View style={styles.chipWrap}>
                  {OTHER_SPECIALIZATION_SUGGESTIONS.map((chip) => {
                    const isSelected = customSpecialization.trim().toLowerCase() === chip.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={chip}
                        style={[
                          styles.suggestionChip,
                          {
                            backgroundColor: isSelected ? `${colors.primary}18` : colors.card,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => setCustomSpecialization(chip)}
                        activeOpacity={0.85}
                      >
                        <Icon
                          name={isSelected ? "checkmark" : "add"}
                          size={14}
                          color={isSelected ? colors.primary : colors.text}
                        />
                        <Text
                          style={[
                            styles.suggestionChipText,
                            { color: isSelected ? colors.primary : colors.text, fontWeight: isSelected ? "800" : "600" },
                          ]}
                        >
                          {chip}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Subscription</Text>
          <Text style={[styles.sectionBody, { color: colors.mutedText }]}>Choose your plan, complete Razorpay payment, and we will instantly unlock the next step.</Text>

          <Text style={[styles.label, { color: colors.text }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            multiline
            value={bio}
            onChangeText={setBio}
            placeholder="Describe your profile, audience, and service style."
            placeholderTextColor={colors.placeholder}
          />

          <Text style={[styles.label, { color: colors.text }]}>Referral code (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={referralCode}
            onChangeText={(text) => setReferralCode(text.toUpperCase())}
            placeholder="Enter shared referral code"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="characters"
          />

          <View style={styles.planGrid}>
            {PLAN_OPTIONS.map((plan) => {
              const selected = premiumPlan === plan.key;

              return (
                <TouchableOpacity
                  key={plan.key}
                  style={[
                    styles.planCard,
                    { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border },
                  ]}
                  onPress={() => {
                    if (paymentVerified && plan.key === premiumPlan) {
                      Alert.alert("Plan active", `You have already activated the ${plan.title} plan.`);
                      return;
                    }
                    setPremiumPlan(plan.key);
                    setPaymentVerified(false);
                    setSubscriptionId("");
                    startSubscriptionPayment(plan.key);
                  }}
                  activeOpacity={0.9}
                >
                  <View style={styles.planTop}>
                    <Text style={[styles.planName, { color: colors.text }]}>{plan.title}</Text>
                    <Text style={[styles.planPrice, { color: colors.primary }]}>INR {plan.amount}</Text>
                  </View>
                  <Text style={[styles.planBody, { color: colors.mutedText }]}>{plan.description}</Text>

                  <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
                    {selected && paymentVerified ? (
                      <View style={{ backgroundColor: "#118B5018", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center" }}>
                        <Icon name="checkmark-circle" size={14} color="#118B50" />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#118B50", marginLeft: 4 }}>Paid ✓</Text>
                      </View>
                    ) : (
                      <View style={{ backgroundColor: `${colors.primary}12`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center" }}>
                        <Icon name="card-outline" size={14} color={colors.primary} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, marginLeft: 4 }}>
                          {selected ? `Tap to Pay INR ${plan.amount}` : `Select & Pay INR ${plan.amount}`}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.paymentPreviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.paymentPreviewHeader}>
              <View style={[styles.paymentPreviewIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Icon name="card-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.paymentPreviewCopy}>
                <Text style={[styles.paymentPreviewTitle, { color: colors.text }]}>Razorpay subscription checkout</Text>
                <Text style={[styles.paymentPreviewBody, { color: colors.mutedText }]}>
                  Pay INR {selectedPlan.amount} for the selected subscription. Only successful payment unlocks the next onboarding step.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.paymentPreviewButton,
                { backgroundColor: paymentVerified ? "#118B50" : colors.primary },
                subscriptionProcessing && styles.buttonDisabled,
              ]}
              onPress={() => startSubscriptionPayment()}
              disabled={subscriptionProcessing}
              activeOpacity={0.9}
            >
              {subscriptionProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.paymentPreviewButtonText}>
                  {paymentVerified ? "Payment done, change plan if needed" : `Pay INR ${selectedPlan.amount} now`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Professional details</Text>
          <Text style={[styles.sectionBody, { color: colors.mutedText }]}>
            {areProfessionalDetailsOptional
              ? "Optional for Other specialization. Add credentials only if they apply to your profession."
              : "Use dropdowns for experience, degree, and certificate type."}
          </Text>

          {renderDropdownField(areProfessionalDetailsOptional ? "Experience (optional)" : "Experience", "experience", experience, "Select experience")}
          {renderDropdownField(areProfessionalDetailsOptional ? "Degree (optional)" : "Degree", "degree", degree, "Select degree")}
          {renderDropdownField(areProfessionalDetailsOptional ? "Certificate type (optional)" : "Certificate type", "certificate", certificateType, "Select certificate type")}

          <Text style={[styles.label, { color: colors.text }]}>
            {areProfessionalDetailsOptional ? "Registration number (optional)" : "Registration number"}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={registrationNumber}
            onChangeText={(text) => {
              setRegistrationNumber(text);
              setDegreeChecked(false);
            }}
            placeholder="Enter registration number"
            placeholderTextColor={colors.placeholder}
          />

          {renderUpload(areProfessionalDetailsOptional ? "Degree upload (optional)" : "Degree upload", degreeDoc, (file) => {
            setDegreeDoc(file);
            setDegreeChecked(false);
          })}
          {renderUpload(areProfessionalDetailsOptional ? "Certificate upload (optional)" : "Certificate upload", licenseDoc, (file) => {
            setLicenseDoc(file);
            setDegreeChecked(false);
          })}

          <TouchableOpacity style={[styles.checkButton, degreeChecked && styles.checkButtonDone]} onPress={handleDegreeCheck}>
            <Icon name={degreeChecked ? "checkmark-circle" : "shield-checkmark-outline"} size={18} color="#fff" />
            <Text style={styles.checkButtonText}>{degreeChecked ? "Checked" : "Check details"}</Text>
          </TouchableOpacity>
        </>
      );
    }

    if (step === 4) {
      const isPassport = identityDocType === "Passport";

      return (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Identity details</Text>
          <Text style={[styles.sectionBody, { color: colors.mutedText }]}>
            Select your identity document and upload clear photos of both Front and Back sides.
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>Select document type</Text>
          <View style={styles.docTypeRow}>
            <TouchableOpacity
              style={[
                styles.docTypeTab,
                { backgroundColor: colors.card, borderColor: !isPassport ? colors.primary : colors.border },
                !isPassport && { backgroundColor: `${colors.primary}12` },
              ]}
              onPress={() => {
                setIdentityDocType("Aadhaar");
                setKycChecked(false);
              }}
              activeOpacity={0.85}
            >
              <Icon
                name="card-outline"
                size={20}
                color={!isPassport ? colors.primary : colors.mutedText}
              />
              <Text
                style={[
                  styles.docTypeTabText,
                  { color: !isPassport ? colors.primary : colors.text, fontWeight: !isPassport ? "800" : "600" },
                ]}
              >
                Aadhaar Card
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.docTypeTab,
                { backgroundColor: colors.card, borderColor: isPassport ? colors.primary : colors.border },
                isPassport && { backgroundColor: `${colors.primary}12` },
              ]}
              onPress={() => {
                setIdentityDocType("Passport");
                setKycChecked(false);
              }}
              activeOpacity={0.85}
            >
              <Icon
                name="book-outline"
                size={20}
                color={isPassport ? colors.primary : colors.mutedText}
              />
              <Text
                style={[
                  styles.docTypeTabText,
                  { color: isPassport ? colors.primary : colors.text, fontWeight: isPassport ? "800" : "600" },
                ]}
              >
                Passport
              </Text>
            </TouchableOpacity>
          </View>

          {!isPassport ? (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Aadhaar card number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                value={aadhaar}
                onChangeText={(text) => {
                  setAadhaar(text);
                  setKycChecked(false);
                }}
                placeholder="XXXX XXXX XXXX"
                placeholderTextColor={colors.placeholder}
                keyboardType="numeric"
              />
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Passport number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                value={passportNumber}
                onChangeText={(text) => {
                  setPassportNumber(text);
                  setKycChecked(false);
                }}
                placeholder="Enter Passport number (e.g. A1234567)"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="characters"
              />
            </>
          )}

          <Text style={[styles.label, { color: colors.text }]}>Upload document photos (Front & Back)</Text>
          <Text style={[styles.fieldHint, { color: colors.mutedText, marginTop: -2, marginBottom: 8 }]}>
            {isPassport
              ? "Upload clear photos of your Passport front page and back/address page."
              : "Upload clear photos of your Aadhaar card front side and back side."}
          </Text>

          {renderUpload(
            isPassport ? "Passport Front Page photo" : "Aadhaar Front Side photo",
            idProofFront || aadhaarDoc,
            (file) => {
              setIdProofFront(file);
              setAadhaarDoc(file);
              setKycChecked(false);
            },
          )}

          {renderUpload(
            isPassport ? "Passport Back Page photo" : "Aadhaar Back Side photo",
            idProofBack || idProof,
            (file) => {
              setIdProofBack(file);
              setIdProof(file);
              setKycChecked(false);
            },
          )}

          <Text style={[styles.label, { color: colors.text }]}>Voice verification</Text>
          <Text style={[styles.fieldHint, { color: colors.mutedText, marginTop: -2, marginBottom: 8 }]}>
            Speak the required phrase clearly to verify your voice identity.
          </Text>

          <View style={[styles.phraseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.phraseHeader}>
              <Icon name="mic-outline" size={18} color={colors.primary} />
              <Text style={[styles.phraseTitle, { color: colors.primary }]}>Read out loud phrase</Text>
            </View>
            <Text style={[styles.phraseText, { color: colors.text }]}>
              "{VOICE_VERIFICATION_PHRASE}"
            </Text>
          </View>

          <View style={[styles.voiceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {isRecordingVoice ? (
              <View style={styles.recordingRow}>
                <View style={styles.recordingDot} />
                <Text style={[styles.recordingTimer, { color: colors.text }]}>
                  Recording... {String(Math.floor(recordingTimer / 60)).padStart(2, "0")}:{String(recordingTimer % 60).padStart(2, "0")}
                </Text>
                <TouchableOpacity
                  style={styles.stopRecordButton}
                  onPress={stopVoiceRecording}
                  activeOpacity={0.85}
                >
                  <Icon name="square" size={14} color="#fff" />
                  <Text style={styles.stopRecordText}>Stop</Text>
                </TouchableOpacity>
              </View>
            ) : voiceDoc ? (
              <View style={styles.voicePreviewRow}>
                <TouchableOpacity
                  style={[styles.voicePlayButton, { backgroundColor: colors.primary }]}
                  onPress={togglePlayVoiceAudio}
                  activeOpacity={0.85}
                >
                  <Icon name={isPlayingVoice ? "pause" : "play"} size={18} color="#fff" />
                </TouchableOpacity>

                <View style={styles.voiceMeta}>
                  <Text style={[styles.voiceFileName, { color: colors.text }]} numberOfLines={1}>
                    {voiceDoc.name || "Voice_verification.m4a"}
                  </Text>
                  <Text style={[styles.voiceStatusText, { color: colors.mutedText }]}>
                    {isPlayingVoice ? "Playing audio..." : "Voice recorded"}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.voiceRerecordButton}
                  onPress={startVoiceRecording}
                  activeOpacity={0.85}
                >
                  <Icon name="refresh-outline" size={16} color={colors.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.voiceDeleteButton}
                  onPress={() => {
                    setVoiceDoc(null);
                    setKycChecked(false);
                  }}
                  activeOpacity={0.85}
                >
                  <Icon name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.voiceActionRow}>
                <TouchableOpacity
                  style={[styles.recordButton, { backgroundColor: colors.primary }]}
                  onPress={startVoiceRecording}
                  activeOpacity={0.85}
                >
                  <Icon name="mic" size={18} color="#fff" />
                  <Text style={styles.recordButtonText}>Record Voice</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.uploadAudioButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={pickVoiceAudio}
                  activeOpacity={0.85}
                >
                  <Icon name="document-attach-outline" size={18} color={colors.text} />
                  <Text style={[styles.uploadAudioText, { color: colors.text }]}>Upload Audio</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <TouchableOpacity style={[styles.checkButton, kycChecked && styles.checkButtonDone]} onPress={handleKycCheck}>
            <Icon name={kycChecked ? "checkmark-circle" : "card-outline"} size={18} color="#fff" />
            <Text style={styles.checkButtonText}>{kycChecked ? "Checked" : "Check details"}</Text>
          </TouchableOpacity>
        </>
      );
    }

    if (step === 5) {
      const faceCardBorderColor = faceCaptureError
        ? "#FCA5A5"
        : faceChecked
          ? "#86EFAC"
          : colors.border;
      const faceStatusBackground = faceCaptureError
        ? "#FEF2F2"
        : faceChecked
          ? "#ECFDF3"
          : colors.surface;
      const faceStatusIconBackground = faceChecked
        ? "rgba(22,163,74,0.12)"
        : faceCaptureError
          ? "rgba(220,38,38,0.10)"
          : "rgba(123,77,255,0.12)";
      const faceStatusIconColor = faceCaptureError
        ? "#DC2626"
        : faceChecked
          ? "#16A34A"
          : colors.primary;
      const faceStatusLabel = faceCaptureError
        ? "Needs attention"
        : faceChecked
          ? "Selfie added"
          : "Optional step";
      const faceStatusText = faceCaptureError
        ? faceCaptureError
        : faceChecked
          ? "Retake if your face is blurry or not centered."
          : "Use the front camera in good light for the smoothest verification review.";
      const faceStatusTextColor = faceCaptureError ? "#B91C1C" : colors.mutedText;

      return (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Face check</Text>
          <Text style={[styles.sectionBody, { color: colors.mutedText }]}>
            Take a clear selfie for identity verification. A clean, centered photo is required before proceeding.
          </Text>

          <View style={[styles.faceStatusCard, { backgroundColor: faceStatusBackground }]}>
            <View style={styles.faceStatusRow}>
              <View style={[styles.faceStatusIconWrap, { backgroundColor: faceStatusIconBackground }]}>
                <Icon
                  name={faceCaptureError ? "alert-circle-outline" : faceChecked ? "checkmark-circle-outline" : "camera-outline"}
                  size={18}
                  color={faceStatusIconColor}
                />
              </View>
              <View style={styles.faceStatusCopy}>
                <Text style={[styles.faceStatusTitle, { color: colors.text }]}>{faceStatusLabel}</Text>
                <Text style={[styles.faceStatusBody, { color: faceStatusTextColor }]}>
                  {faceStatusText}
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.faceCard, { backgroundColor: colors.card, borderColor: faceCardBorderColor }]}
            onPress={captureFaceCheck}
            activeOpacity={0.9}
            disabled={faceCaptureLoading}
          >
            {faceCheckPreview ? (
              <View>
                <Image source={{ uri: faceCheckPreview }} style={styles.facePreview} />
                <View style={styles.facePreviewBadge}>
                  <Icon name="camera-reverse-outline" size={14} color="#fff" />
                  <Text style={styles.facePreviewBadgeText}>Tap to retake</Text>
                </View>
              </View>
            ) : (
              <View style={styles.facePlaceholder}>
                {faceCaptureLoading ? (
                  <>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.faceTitle, { color: colors.text }]}>Opening camera</Text>
                    <Text style={[styles.faceBody, { color: colors.mutedText }]}>Getting your front camera ready.</Text>
                  </>
                ) : (
                  <>
                    <Icon name="scan-outline" size={44} color={colors.primary} />
                    <Text style={[styles.faceTitle, { color: colors.text }]}>Take selfie</Text>
                    <Text style={[styles.faceBody, { color: colors.mutedText }]}>Front camera, clean light, clear face.</Text>
                  </>
                )}
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.faceActionRow}>
            <TouchableOpacity
              style={[styles.faceActionButton, { backgroundColor: colors.primary }, faceCaptureLoading && styles.buttonDisabled]}
              onPress={captureFaceCheck}
              disabled={faceCaptureLoading}
            >
              {faceCaptureLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name={faceCheckPreview ? "refresh-outline" : "camera-outline"} size={16} color="#fff" />
                  <Text style={styles.faceActionButtonText}>{faceCheckPreview ? "Retake selfie" : "Open camera"}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      );
    }

    if (step === 6) {
      return (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Service pricing</Text>
          <Text style={[styles.sectionBody, { color: colors.mutedText }]}>
            Enter service name and set compulsory rates for all 4 duration options within your plan limits.
          </Text>

          <View style={[styles.rateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.rateLabel, { color: colors.mutedText }]}>Selected Plan Limit Overview</Text>
            <Text style={[styles.rateValue, { color: colors.primary }]}>{selectedPlan.title}</Text>
            <Text style={[styles.rateBody, { color: colors.mutedText }]}>
              Hourly limit: INR {selectedPlan.maxHourlyRate}/hour. Setting rates for 1 min, 15 min, 30 min, and 1 hour is compulsory.
            </Text>
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Service name *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={serviceName}
            onChangeText={setServiceName}
            placeholder="Consultation, legal call, brand review"
            placeholderTextColor={colors.placeholder}
          />

          <Text style={[styles.label, { color: colors.text }]}>1 min duration rate *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={rate1Min}
            onChangeText={setRate1Min}
            placeholder={`Max allowed INR ${rateLimit1Min}`}
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
          />

          <Text style={[styles.label, { color: colors.text }]}>15 min duration rate *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={rate15Min}
            onChangeText={setRate15Min}
            placeholder={`Max allowed INR ${rateLimit15Min}`}
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
          />

          <Text style={[styles.label, { color: colors.text }]}>30 min duration rate *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={rate30Min}
            onChangeText={setRate30Min}
            placeholder={`Max allowed INR ${rateLimit30Min}`}
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
          />

          <Text style={[styles.label, { color: colors.text }]}>1 hour duration rate *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            value={rate1Hour}
            onChangeText={setRate1Hour}
            placeholder={`Max allowed INR ${rateLimit1Hour}`}
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
          />
        </>
      );
    }

    return (
      <>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Extra pricing & Promotion</Text>
        <Text style={[styles.sectionBody, { color: colors.mutedText }]}>
          Set message, call rates, and brand promotion pricing. Promotion rates automatically sync to your Featured Profile. You can also skip this step.
        </Text>

        <View style={[styles.rateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rateLabel, { color: colors.mutedText }]}>Call & Message Rates (Optional)</Text>
          <Text style={[styles.rateBody, { color: colors.mutedText, marginTop: 2 }]}>
            Set pricing for direct messaging, audio calls, and video calls.
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Message price (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          value={messagePrice}
          onChangeText={setMessagePrice}
          placeholder="INR per message"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
        />

        <Text style={[styles.label, { color: colors.text }]}>Audio call price (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          value={audioCallPrice}
          onChangeText={setAudioCallPrice}
          placeholder="INR per min"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
        />

        <Text style={[styles.label, { color: colors.text }]}>Video call price (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          value={videoCallPrice}
          onChangeText={setVideoCallPrice}
          placeholder="INR per min"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
        />

        <View style={[styles.rateCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 }]}>
          <Text style={[styles.rateLabel, { color: colors.primary }]}>Promotion Pricing (Featured Profile Sync)</Text>
          <Text style={[styles.rateBody, { color: colors.mutedText, marginTop: 2 }]}>
            Rates entered here will automatically populate your Featured Profile for creator brand promotions.
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Post promotion price (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          value={promotionPostPrice}
          onChangeText={setPromotionPostPrice}
          placeholder="INR for one post"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
        />

        <Text style={[styles.label, { color: colors.text }]}>Story promotion price (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          value={promotionStoryPrice}
          onChangeText={setPromotionStoryPrice}
          placeholder="INR for one story"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
        />

        <Text style={[styles.label, { color: colors.text }]}>Reel promotion price (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          value={promotionReelPrice}
          onChangeText={setPromotionReelPrice}
          placeholder="INR for one reel"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
        />

        <View style={[styles.termsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.termsHeader}>
            <View style={[styles.termsIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Icon name="document-text-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.termsCopy}>
              <Text style={[styles.termsTitle, { color: colors.text }]}>Seller terms and conditions</Text>
              <Text style={[styles.termsBody, { color: colors.mutedText }]}>
                Read the conduct terms and sign by accepting before submitting your seller account.
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.termsLink} onPress={() => setTermsVisible(true)}>
            <Text style={[styles.termsLinkText, { color: colors.primary }]}>View full terms</Text>
            <Icon name="open-outline" size={16} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.termsAcceptRow, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => setTermsAccepted((value) => !value)}
            activeOpacity={0.85}
          >
            <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: "transparent" }]}>
              {termsAccepted ? <Icon name="checkmark" size={16} color={colors.text} /> : null}
            </View>
            <Text style={[styles.termsAcceptText, { color: colors.text }]}>
              I accept and sign these seller terms as {name.trim() || "the seller"}.
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  const dropdownMeta = getDropdownMeta();

  if (initializing) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.headerIconButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {mode === "edit" ? "Update Seller Profile" : "Become a Seller"}
          </Text>
          <View style={styles.headerIconButton} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerTitle}>Seller profile issue</Text>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          <Text style={[styles.stepLabel, { color: colors.mutedText }]}>Step {step} of {TOTAL_STEPS}</Text>
          {renderStepPills()}
          {renderStepContent()}

          <View style={styles.footerRow}>
            {step > 1 ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep((prev) => Math.max(1, prev - 1))}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.buttonSpacer} />
            )}

            {step < TOTAL_STEPS ? (
              <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
                <Text style={styles.primaryButtonText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={submitSellerRegistration} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Finish</Text>}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        <Modal visible={Boolean(activeDropdown)} transparent animationType="fade" onRequestClose={() => setActiveDropdown(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{dropdownMeta.title}</Text>
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                {dropdownMeta.options.map((option) => (
                  <TouchableOpacity key={option} style={[styles.modalOption, { borderBottomColor: colors.border }]} onPress={() => applyDropdownValue(option)}>
                    <Text style={[styles.modalOptionText, { color: colors.text }]}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setActiveDropdown(null)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={termsVisible} transparent animationType="fade" onRequestClose={() => setTermsVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Seller Terms and Conditions</Text>
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                {SELLER_TERMS_PARAGRAPHS.map((paragraph) => (
                  <Text key={paragraph} style={[styles.termParagraph, { color: colors.text }]}>
                    {paragraph}
                  </Text>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setTermsVisible(false)}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SellerRegistration;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28 },
  header: {
    height: 82,
    paddingTop: 26,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center" },
  errorBanner: {
    marginBottom: 14,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  errorBannerTitle: { color: "#991B1B", fontWeight: "800", marginBottom: 4 },
  errorBannerText: { color: "#B91C1C", lineHeight: 19 },
  stepLabel: { fontSize: 13, fontWeight: "800" },
  progressRow: { flexDirection: "row", marginTop: 10, marginBottom: 18 },
  progressPill: { flex: 1, height: 5, borderRadius: 999, marginRight: 6 },
  sectionTitle: { fontSize: 24, fontWeight: "900" },
  sectionBody: { marginTop: 6, marginBottom: 16, fontSize: 14, lineHeight: 20 },
  stepIntroCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 14,
  },
  stepIntroHeader: { flexDirection: "row", alignItems: "flex-start" },
  stepIntroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepIntroCopy: { flex: 1 },
  stepIntroTitle: { fontSize: 16, fontWeight: "900" },
  stepIntroBody: { marginTop: 4, fontSize: 13, lineHeight: 19 },
  stepTipList: { marginTop: 14 },
  stepTipRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  stepTipText: { marginLeft: 10, flex: 1, fontSize: 13, fontWeight: "700" },
  mediaSectionCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 14,
  },
  mediaSectionHeader: { marginBottom: 14 },
  mediaSectionTitle: { fontSize: 16, fontWeight: "900" },
  mediaSectionBody: { marginTop: 4, fontSize: 13, lineHeight: 19 },
  mediaCard: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  mediaCardCompact: { flexDirection: "column", alignItems: "stretch" },
  mediaItem: { width: 104, marginRight: 16, alignItems: "center" },
  mediaItemCompact: { width: "100%", marginRight: 0, marginBottom: 14, alignItems: "flex-start" },
  mediaLabel: { fontSize: 13, fontWeight: "800", marginBottom: 10, alignSelf: "flex-start" },
  mediaHint: { marginTop: 8, fontSize: 12, lineHeight: 17, textAlign: "center" },
  avatarPicker: { width: 92, height: 92, alignSelf: "center" },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#E5E7EB" },
  avatarBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#7B4DFF",
    alignItems: "center",
    justifyContent: "center",
  },
  coverBlock: { flex: 1 },
  coverBlockCompact: { marginTop: 0 },
  coverPicker: { width: "100%", height: 110, borderRadius: 16, overflow: "hidden", backgroundColor: "#E5E7EB" },
  coverPickerCompact: { width: "100%", marginTop: 0 },
  cover: { width: "100%", height: "100%" },
  formSectionCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  formSectionTitle: { fontSize: 16, fontWeight: "900" },
  formSectionBody: { marginTop: 4, fontSize: 13, lineHeight: 19 },
  label: { marginTop: 14, marginBottom: 6, fontSize: 13, fontWeight: "800" },
  fieldHint: { marginTop: 6, fontSize: 12, lineHeight: 17 },
  paymentPreviewCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  paymentPreviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  paymentPreviewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  paymentPreviewCopy: {
    flex: 1,
  },
  paymentPreviewTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  paymentPreviewBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 20,
  },
  paymentPreviewButton: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  paymentPreviewButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  textArea: { minHeight: 110, textAlignVertical: "top" },
  dropdownField: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: { flex: 1, fontSize: 15, paddingRight: 12 },
  planGrid: { marginTop: 4 },
  planCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { fontSize: 15, fontWeight: "900" },
  planPrice: { fontSize: 15, fontWeight: "900" },
  planBody: { marginTop: 6, fontSize: 13, lineHeight: 18 },
  uploadBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, marginTop: 12 },
  uploadInner: { padding: 14, flexDirection: "row", alignItems: "center" },
  uploadContent: { flex: 1, marginLeft: 12, marginRight: 8 },
  uploadTitle: { fontSize: 14, fontWeight: "800" },
  uploadText: { marginTop: 2, fontSize: 12 },
  checkButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#7B4DFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  checkButtonDone: { backgroundColor: "#118B50" },
  checkButtonText: { color: "#fff", fontWeight: "800", marginLeft: 8 },
  faceStatusCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  faceStatusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  faceStatusIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  faceStatusCopy: { flex: 1 },
  faceStatusTitle: { fontSize: 14, fontWeight: "900" },
  faceStatusBody: { marginTop: 3, fontSize: 12, lineHeight: 18 },
  faceCard: {
    minHeight: 280,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    overflow: "hidden",
  },
  facePreview: { width: "100%", height: 320 },
  facePreviewBadge: {
    position: "absolute",
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.74)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  facePreviewBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 6,
  },
  facePlaceholder: { minHeight: 280, alignItems: "center", justifyContent: "center", padding: 20 },
  faceTitle: { marginTop: 10, fontSize: 18, fontWeight: "900" },
  faceBody: { marginTop: 4, fontSize: 13, textAlign: "center", lineHeight: 18 },
  faceActionRow: {
    marginTop: 12,
    flexDirection: "row",
  },
  faceActionButton: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  faceActionButtonText: {
    color: "#fff",
    fontWeight: "800",
    marginLeft: 8,
  },
  rateCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, marginBottom: 2 },
  rateLabel: { fontSize: 12, fontWeight: "800" },
  rateValue: { marginTop: 4, fontSize: 30, fontWeight: "900" },
  rateBody: { marginTop: 4, fontSize: 13, lineHeight: 19 },
  termsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
  },
  termsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  termsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  termsCopy: { flex: 1 },
  termsTitle: { fontSize: 15, fontWeight: "400" },
  termsBody: { marginTop: 4, fontSize: 12, lineHeight: 18 },
  termsLink: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  termsLinkText: { fontSize: 13, fontWeight: "400", marginRight: 6 },
  termsAcceptRow: {
    marginTop: 12,
    minHeight: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  termsAcceptText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "400" },
  footerRow: { marginTop: 24, flexDirection: "row", alignItems: "center" },
  secondaryButton: {
    minHeight: 48,
    minWidth: 96,
    borderRadius: 14,
    backgroundColor: "#6B7280",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryButtonText: { color: "#fff", fontWeight: "800" },
  buttonSpacer: { width: 96 },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    marginLeft: 12,
    backgroundColor: "#7B4DFF",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  buttonDisabled: { opacity: 0.7 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 18, paddingTop: 16, overflow: "hidden" },
  modalTitle: { fontSize: 17, fontWeight: "400", paddingHorizontal: 16, marginBottom: 8 },
  modalList: { maxHeight: 320 },
  modalOption: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalOptionText: { fontSize: 15, fontWeight: "700" },
  termParagraph: {
    paddingHorizontal: 16,
    marginBottom: 13,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "400",
  },
  modalCloseButton: {
    margin: 16,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#7B4DFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: { color: "#fff", fontWeight: "800" },
  docTypeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  docTypeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  docTypeTabText: {
    marginLeft: 8,
    fontSize: 14,
  },
  phraseCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  phraseHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  phraseTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
  },
  phraseText: {
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 19,
    fontWeight: "600",
  },
  voiceCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#EF4444",
  },
  recordingTimer: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "800",
  },
  stopRecordButton: {
    backgroundColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  stopRecordText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    marginLeft: 6,
  },
  voicePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  voicePlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceMeta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  voiceFileName: {
    fontSize: 13,
    fontWeight: "700",
  },
  voiceStatusText: {
    fontSize: 11,
    marginTop: 2,
  },
  voiceRerecordButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(123,77,255,0.12)",
    marginRight: 6,
  },
  voiceDeleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
  },
  voiceActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  recordButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  recordButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    marginLeft: 8,
  },
  uploadAudioButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  uploadAudioText: {
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 6,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
    marginBottom: 6,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  suggestionChipText: {
    fontSize: 13,
    marginLeft: 4,
  },
});
