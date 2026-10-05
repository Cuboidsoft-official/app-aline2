// Type declarations for react-native-country-codes-picker@2.3.5.
// Consumed by the tsconfig.json "paths" entry below, which redirects the
// module specifier here instead of the package's raw index.tsx.  The package
// ships no compiled output; its .tsx source references the removed global JSX
// namespace (React 19) and has filter callbacks incompatible with
// noImplicitReturns, so TypeScript cannot check it against this project's stack.
// This file provides accurate, project-compatible types without modifying
// node_modules (survives npm ci) or weakening global type safety.
import React from 'react';
import { TextStyle, ViewStyle } from 'react-native';

export interface CountryItem {
  name: Record<string, string>;
  dial_code: string;
  code: string;
  flag: string;
}

export interface Style {
  backdrop?: ViewStyle;
  modal?: ViewStyle;
  line?: ViewStyle;
  searchMessageText?: TextStyle;
  itemsList?: ViewStyle;
  modalInner?: ViewStyle;
  countryMessageContainer?: ViewStyle;
  textInput?: TextStyle;
  countryButtonStyles?: ViewStyle;
  flag?: TextStyle;
  dialCode?: TextStyle;
  countryName?: TextStyle;
}

export interface ItemTemplateProps {
  item: CountryItem;
  name: string;
  style?: Style;
  onPress?: (arg: any) => any;
}

export interface ListHeaderComponentProps {
  countries: CountryItem[];
  lang: string;
  onPress: (item: CountryItem) => void;
}

interface CountryPickerProps {
  show: boolean;
  lang?: string;
  excludedCountries?: string[];
  showOnly?: string[];
  popularCountries?: string[];
  style?: Style;
  enableModalAvoiding?: boolean;
  disableBackdrop?: boolean;
  onBackdropPress?: (...args: any[]) => any;
  pickerButtonOnPress: (item: CountryItem) => any;
  itemTemplate?: (props: ItemTemplateProps) => React.ReactElement;
  ListHeaderComponent?: (props: ListHeaderComponentProps) => React.ReactElement;
  onRequestClose?: (...args: any[]) => any;
  inputPlaceholder?: string;
  inputPlaceholderTextColor?: TextStyle['color'];
  searchMessage?: string;
  androidWindowSoftInputMode?: string;
  initialState?: string;
}

interface CountryListProps {
  lang?: string;
  searchValue?: string;
  excludedCountries?: string[];
  popularCountries?: string[];
  showOnly?: string[];
  ListHeaderComponent?: (props: ListHeaderComponentProps) => React.ReactElement;
  itemTemplate?: (props: ItemTemplateProps) => React.ReactElement;
  pickerButtonOnPress: (item: CountryItem) => any;
  style?: Style;
}

export declare function CountryPicker(props: CountryPickerProps): React.ReactElement | null;
export declare function CountryList(props: CountryListProps): React.ReactElement | null;
export declare function CountryButton(props: ItemTemplateProps): React.ReactElement | null;
export declare const countryCodes: CountryItem[];
