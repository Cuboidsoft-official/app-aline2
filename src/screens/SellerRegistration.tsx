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
import { ensureCameraPermission } from "../utils/permissions";
import { openRazorpayCheckout } from "../utils/razorpayCheckout";
import { getStoredRefreshToken, getStoredSessionMeta, getStoredToken, getStoredUser, setStoredSession } from "../utils/authSession";

const DEFAULT_COVER = DEFAULT_COVER_URL;
const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;
const TOTAL_STEPS = 6;

const SPECIALIZATION_OPTIONS = [
  "Creator",
  "Business",
  "Lawyer",
  "Doctor",
  "Coach",
  "Consultant",
  "Trainer",
  "Other",
];

const PLAN_OPTIONS = [
  {
    key: "PLAN_100",
    title: "INR 100",
    amount: 100,
    maxHourlyRate: 1000,
    description: "Plan limit INR 1000.",
  },
  {
    key: "PLAN_200",
    title: "INR 200",
    amount: 200,
    maxHourlyRate: 2000,
    description: "Plan limit INR 2000.",
  },
  {
    key: "PLAN_300",
    title: "INR 300",
    amount: 300,
    maxHourlyRate: 3000,
    description: "Plan limit INR 3000.",
  },
  {
    key: "PLAN_400",
    title: "INR 400",
    amount: 400,
    maxHourlyRate: 4000,
    description: "Plan limit INR 4000.",
  },
  {
    key: "PLAN_600",
    title: "INR 600",
    amount: 600,
    maxHourlyRate: 6000,
    description: "Plan limit INR 6000.",
  },
  {
    key: "PLAN_6000",
    title: "INR 6000",
    amount: 6000,
    maxHourlyRate: 999999,
    description: "Unlimited pricing plan.",
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
  aadhaar?: string;
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
  degreeDoc?: string;
  licenseDoc?: string;
  aadhaarDoc?: string;
  panDoc?: string;
  idProof?: string;
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
  const [paymentVerified, setPaymentVerified] = useState(mode === "edit");
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

  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [aadhaarDoc, setAadhaarDoc] = useState<DocumentFile | null>(null);
  const [panDoc, setPanDoc] = useState<DocumentFile | null>(null);
  const [idProof, setIdProof] = useState<DocumentFile | null>(null);
  const [kycChecked, setKycChecked] = useState(false);

  const [faceCheckPreview, setFaceCheckPreview] = useState<string | null>(null);
  const [faceCheckDoc, setFaceCheckDoc] = useState<ImageFile | null>(null);
  const [faceChecked, setFaceChecked] = useState(false);
  const [faceCaptureLoading, setFaceCaptureLoading] = useState(false);
  const [faceCaptureError, setFaceCaptureError] = useState("");

  const [serviceName, setServiceName] = useState("");
  const [serviceDurationMinutes, setServiceDurationMinutes] = useState("15");
  const [serviceRate, setServiceRate] = useState("");
  const [promotionPostPrice, setPromotionPostPrice] = useState("");
  const [promotionStoryPrice, setPromotionStoryPrice] = useState("");
  const [promotionReelPrice, setPromotionReelPrice] = useState("");

  const selectedPlan = useMemo(
    () => PLAN_OPTIONS.find((plan) => plan.key === premiumPlan) || PLAN_OPTIONS[0],
    [premiumPlan],
  );
  const durationMinutes = Number(serviceDurationMinutes) || 0;
  const rateLimit = Math.floor((selectedPlan.maxHourlyRate * durationMinutes) / 60);
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
    setPaymentVerified(Boolean(seller?.subscriptionPlan?.code));
    setSubscriptionId("");
    setExperience(seller?.experience || "");
    setDegree(seller?.degree || "");
    setCertificateType(seller?.certificateType || "");
    setRegistrationNumber(seller?.registrationNumber || "");
    setDegreeDoc(toDocumentFile(seller?.degreeDoc));
    setLicenseDoc(toDocumentFile(seller?.licenseDoc));
    setDegreeChecked(Boolean(seller?.degreeChecked || seller?.degreeDoc));
    setAadhaar(seller?.aadhaar || "");
    setPan(seller?.pan || "");
    setBankAccountName(seller?.bankAccountName || "");
    setBankAccountNumber(seller?.bankAccountNumber || "");
    setBankIfsc(seller?.bankIfsc || "");
    setBankName(seller?.bankName || "");
    setAadhaarDoc(toDocumentFile(seller?.aadhaarDoc));
    setPanDoc(toDocumentFile(seller?.panDoc));
    setIdProof(toDocumentFile(seller?.idProof));
    setKycChecked(Boolean(seller?.kycChecked || seller?.aadhaarDoc || seller?.panDoc));
    setFaceCheckPreview(seller?.faceCheckDoc || null);
    setFaceCheckDoc(toDocumentFile(seller?.faceCheckDoc));
    setFaceChecked(Boolean(seller?.faceChecked || seller?.faceCheckDoc));
    setServiceName(seller?.onboardingServiceName || "");
    setServiceDurationMinutes(String(seller?.onboardingServiceDurationMinutes || "15"));
    setServiceRate(String(seller?.onboardingServiceRate || ""));
    setPromotionPostPrice(String(seller?.promotionPricing?.post || ""));
    setPromotionStoryPrice(String(seller?.promotionPricing?.story || ""));
    setPromotionReelPrice(String(seller?.promotionPricing?.reel || ""));
  }, []);

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
    if (
      !aadhaar.trim()
      || !pan.trim()
      || !bankAccountName.trim()
      || !bankAccountNumber.trim()
      || !bankIfsc.trim()
      || !aadhaarDoc
      || !panDoc
      || !idProof
    ) {
      Alert.alert("KYC", "Complete Aadhaar, PAN, bank details, and uploads first.");
      return;
    }

    setKycChecked(true);
    Alert.alert("Checked", "KYC and bank details are ready for review.");
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
      if (!aadhaar.trim() || !pan.trim() || !bankAccountName.trim() || !bankAccountNumber.trim() || !bankIfsc.trim()) {
        Alert.alert("Validation", "Please complete Aadhaar, PAN, and bank details.");
        return false;
      }
      if (!aadhaarDoc || !panDoc || !idProof) {
        Alert.alert("Validation", "Please upload Aadhaar, PAN, and bank proof.");
        return false;
      }
      if (!kycChecked) {
        Alert.alert("Validation", "Tap Check on KYC before continuing.");
        return false;
      }
    }

    if (step === 6) {
      const rate = Number(serviceRate) || 0;

      if (!serviceName.trim()) {
        Alert.alert("Validation", "Please enter service name.");
        return false;
      }
      if (durationMinutes <= 0) {
        Alert.alert("Validation", "Please select service duration.");
        return false;
      }
      if (rate <= 0) {
        Alert.alert("Validation", "Please enter service rate.");
        return false;
      }
      if (rate > rateLimit) {
        Alert.alert("Rate limit", `For ${durationMinutes} min, max allowed rate is INR ${rateLimit}.`);
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
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

  const startSubscriptionPayment = useCallback(async () => {
    try {
      if (!name.trim()) {
        Alert.alert("Seller name", "Enter seller name before plan payment.");
        return;
      }

      if (!specializationValue) {
        Alert.alert("Specialization", "Select specialization before plan payment.");
        return;
      }

      if (!bio.trim()) {
        Alert.alert("Description", "Add a seller description before payment.");
        return;
      }

      setSubscriptionProcessing(true);

      const orderRes = await API.post("/seller/subscription/order", {
        planCode: premiumPlan,
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
        description: `${selectedPlan.title} subscription`,
      });

      await API.post(`/seller/subscription/${nextSubscriptionId}/verify`, checkoutResult);

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
  }, [bio, name, premiumPlan, selectedPlan.title, specializationValue]);

  const submitSellerRegistration = async () => {
    try {
      if (!validateCurrentStep()) return;

      setLoading(true);

      const [
        uploadedProfilePic,
        uploadedCoverPic,
        uploadedDegreeDoc,
        uploadedLicenseDoc,
        uploadedAadhaarDoc,
        uploadedPanDoc,
        uploadedIdProof,
        uploadedFaceCheckDoc,
      ] = await Promise.all([
        uploadImageOrKeep(avatarFile, avatar),
        uploadImageOrKeep(coverFile, cover),
        uploadDocumentOrKeep(degreeDoc),
        uploadDocumentOrKeep(licenseDoc),
        uploadDocumentOrKeep(aadhaarDoc),
        uploadDocumentOrKeep(panDoc),
        uploadDocumentOrKeep(idProof),
        uploadImageOrKeep(faceCheckDoc, faceCheckPreview),
      ]);

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
        aadhaar: aadhaar.trim(),
        pan: pan.trim(),
        bankAccountName: bankAccountName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        bankIfsc: bankIfsc.trim().toUpperCase(),
        bankName: bankName.trim(),
        referralCode: referralCode.trim().toUpperCase(),
        degreeDoc: uploadedDegreeDoc,
        licenseDoc: uploadedLicenseDoc,
        aadhaarDoc: uploadedAadhaarDoc,
        panDoc: uploadedPanDoc,
        idProof: uploadedIdProof,
        faceCheckDoc: uploadedFaceCheckDoc,
        profilePic: uploadedProfilePic,
        coverPic: uploadedCoverPic,
        degreeChecked,
        kycChecked,
        faceChecked,
        onboardingServiceName: serviceName.trim(),
        onboardingServiceDurationMinutes: durationMinutes,
        onboardingServiceRate: Number(serviceRate) || 0,
        onboardingServiceRateLimit: rateLimit,
        promotionPricing: {
          post: Number(promotionPostPrice) || 0,
          story: Number(promotionStoryPrice) || 0,
          reel: Number(promotionReelPrice) || 0,
        },
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
                  placeholder="Enter specialization"
                  placeholderTextColor={colors.placeholder}
                />
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
                    if (plan.key !== premiumPlan) {
                      setPremiumPlan(plan.key);
                      setPaymentVerified(false);
                      setSubscriptionId("");
                    }
                  }}
                  activeOpacity={0.9}
                >
                  <View style={styles.planTop}>
                    <Text style={[styles.planName, { color: colors.text }]}>{plan.title}</Text>
                    <Text style={[styles.planPrice, { color: colors.primary }]}>INR {plan.amount}</Text>
                  </View>
                  <Text style={[styles.planBody, { color: colors.mutedText }]}>{plan.description}</Text>
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
              onPress={startSubscriptionPayment}
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
      return (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Aadhaar, PAN, bank details</Text>
          <Text style={[styles.sectionBody, { color: colors.mutedText }]}>Complete KYC and payout details.</Text>

          <Text style={[styles.label, { color: colors.text }]}>Aadhaar number</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={aadhaar} onChangeText={(text) => { setAadhaar(text); setKycChecked(false); }} placeholder="XXXX XXXX XXXX" placeholderTextColor={colors.placeholder} keyboardType="numeric" />

          <Text style={[styles.label, { color: colors.text }]}>PAN number</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={pan} onChangeText={(text) => { setPan(text.toUpperCase()); setKycChecked(false); }} placeholder="ABCDE1234F" placeholderTextColor={colors.placeholder} autoCapitalize="characters" />

          <Text style={[styles.label, { color: colors.text }]}>Account holder</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={bankAccountName} onChangeText={(text) => { setBankAccountName(text); setKycChecked(false); }} placeholder="Account holder name" placeholderTextColor={colors.placeholder} />

          <Text style={[styles.label, { color: colors.text }]}>Account number</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={bankAccountNumber} onChangeText={(text) => { setBankAccountNumber(text); setKycChecked(false); }} placeholder="Bank account number" placeholderTextColor={colors.placeholder} keyboardType="numeric" />

          <Text style={[styles.label, { color: colors.text }]}>IFSC</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={bankIfsc} onChangeText={(text) => { setBankIfsc(text.toUpperCase()); setKycChecked(false); }} placeholder="IFSC code" placeholderTextColor={colors.placeholder} autoCapitalize="characters" />

          <Text style={[styles.label, { color: colors.text }]}>Bank name</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={bankName} onChangeText={setBankName} placeholder="Bank name" placeholderTextColor={colors.placeholder} />

          {renderUpload("Aadhaar upload", aadhaarDoc, (file) => { setAadhaarDoc(file); setKycChecked(false); })}
          {renderUpload("PAN upload", panDoc, (file) => { setPanDoc(file); setKycChecked(false); })}
          {renderUpload("Bank proof", idProof, (file) => { setIdProof(file); setKycChecked(false); })}

          <TouchableOpacity style={[styles.checkButton, kycChecked && styles.checkButtonDone]} onPress={handleKycCheck}>
            <Icon name={kycChecked ? "checkmark-circle" : "card-outline"} size={18} color="#fff" />
            <Text style={styles.checkButtonText}>{kycChecked ? "Checked" : "Check KYC"}</Text>
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
            Take a clear selfie for verification. This step is optional for now, and you can continue without a selfie while testing later screens.
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

    return (
      <>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Service pricing</Text>
        <Text style={[styles.sectionBody, { color: colors.mutedText }]}>Rate limit depends on your selected plan.</Text>

        <View style={[styles.rateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rateLabel, { color: colors.mutedText }]}>Max allowed for this duration</Text>
          <Text style={[styles.rateValue, { color: colors.primary }]}>INR {rateLimit || 0}</Text>
          <Text style={[styles.rateBody, { color: colors.mutedText }]}>
            {selectedPlan.title}: INR {selectedPlan.maxHourlyRate}/hour. Example: 15 min max INR {Math.floor((selectedPlan.maxHourlyRate * 15) / 60)}.
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Service name</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={serviceName} onChangeText={setServiceName} placeholder="Consultation, legal call, brand review" placeholderTextColor={colors.placeholder} />

        {renderDropdownField("Duration", "duration", serviceDurationMinutes ? `${serviceDurationMinutes} min` : "", "Select duration")}

        <Text style={[styles.label, { color: colors.text }]}>Your rate</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={serviceRate} onChangeText={setServiceRate} placeholder={`Max INR ${rateLimit || 0}`} placeholderTextColor={colors.placeholder} keyboardType="numeric" />

        <View style={[styles.rateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rateLabel, { color: colors.mutedText }]}>Promotion pricing</Text>
          <Text style={[styles.rateBody, { color: colors.mutedText }]}>
            Set creator rates for brand promotions. These prices are shown in the promotion marketplace.
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Post promotion price</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={promotionPostPrice} onChangeText={setPromotionPostPrice} placeholder="INR for one post" placeholderTextColor={colors.placeholder} keyboardType="numeric" />

        <Text style={[styles.label, { color: colors.text }]}>Story promotion price</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={promotionStoryPrice} onChangeText={setPromotionStoryPrice} placeholder="INR for one story" placeholderTextColor={colors.placeholder} keyboardType="numeric" />

        <Text style={[styles.label, { color: colors.text }]}>Reel promotion price</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} value={promotionReelPrice} onChangeText={setPromotionReelPrice} placeholder="INR for one reel" placeholderTextColor={colors.placeholder} keyboardType="numeric" />
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
                <Text style={styles.primaryButtonText}>{step === 5 && !faceChecked ? "Skip for now" : "Continue"}</Text>
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
  modalTitle: { fontSize: 17, fontWeight: "900", paddingHorizontal: 16, marginBottom: 8 },
  modalList: { maxHeight: 320 },
  modalOption: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalOptionText: { fontSize: 15, fontWeight: "700" },
  modalCloseButton: {
    margin: 16,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#7B4DFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: { color: "#fff", fontWeight: "800" },
});
