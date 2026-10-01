import { forwardRef, type ComponentProps } from 'react';
import { TextField } from './TextField';

type AmountInputProps = Omit<ComponentProps<typeof TextField>, 'prefix' | 'type' | 'inputMode'>;

/**
 * Rupee amount entry (SPEC §11): "₹" prefix and the decimal keypad on phones. The value stays a
 * string; parse it with parseRupeesToPaise from shared/lib/money — never parseFloat.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  function AmountInput(props, ref) {
    return (
      <TextField
        ref={ref}
        prefix="₹"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        {...props}
      />
    );
  },
);
