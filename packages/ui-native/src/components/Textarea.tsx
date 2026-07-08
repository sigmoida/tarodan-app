import React from 'react';
import { Input, type InputProps } from './Input';

export type TextareaProps = Omit<InputProps, 'inputSize' | 'multiline' | 'numberOfLines'> & {
  rows?: number;
};

export const Textarea: React.FC<TextareaProps> = ({ rows = 4, ...rest }) => {
  return (
    <Input
      multiline
      numberOfLines={rows}
      textAlignVertical="top"
      {...rest}
    />
  );
};
