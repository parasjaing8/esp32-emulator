import React from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

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
  return (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentInsetAdjustmentBehavior="automatic"
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
