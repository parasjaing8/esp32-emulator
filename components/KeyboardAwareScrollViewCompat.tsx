import React from 'react';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

interface Props extends ScrollViewProps {
  bottomOffset?: number;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  children?: React.ReactNode;
}

export function KeyboardAwareScrollViewCompat({
  bottomOffset = 0,
  keyboardShouldPersistTaps = 'handled',
  children,
  ...rest
}: Props) {
  if (Platform.OS === 'web') {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...rest}>
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
