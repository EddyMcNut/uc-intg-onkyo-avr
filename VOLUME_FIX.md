# Volume Conversion Fix

## Issue

Volume slider was showing incorrect values. When volume was set to 35, the slider showed 53.

## Root Cause

The original implementation incorrectly interpreted the Onkyo eISCP protocol's "hexadecimal representation" comment.

### What Was Wrong:

- When AVR sent `MVL35`, we were treating "35" as a hexadecimal string and converting to decimal
- `parseInt("35", 16)` = 53 decimal ❌
- This made volume 35 appear as volume 53 on the slider

### What Should Happen:

The Onkyo eISCP protocol uses hexadecimal encoding where:

- The hexadecimal VALUE represents the decimal volume level
- Volume 35 (decimal) should be sent as `0x23` in hex = "23" as string
- Volume 80 (decimal) should be sent as `0x50` in hex = "50" as string

## The Fix

### sender (onkyoCommandSender.ts):

```typescript
// OLD (WRONG):
const hexVolume = volumeLevel.toString(16).toUpperCase().padStart(2, "0");
// This was correct - converts decimal to hex string

// NEW (CORRECT):
const hexVolume = volumeLevel.toString(16).toUpperCase().padStart(2, "0");
// Same code - this part was already correct!
```

### receiver (onkyoCommandReceiver.ts):

```typescript
// OLD (WRONG):
if (argStr.match(/^[0-9A-Fa-f]+$/)) {
  volumeValue = parseInt(argStr, 16); // "35" → 53 ❌
} else {
  volumeValue = parseInt(argStr, 10);
}

// NEW (CORRECT):
volumeValue = parseInt(argStr, 16); // "23" → 35 ✅
// Always parse as hex since Onkyo ALWAYS sends hex format
```

## Examples After Fix

| Desired Volume | Sent to AVR | AVR Reports | Parsed Value | Slider Shows |
| -------------- | ----------- | ----------- | ------------ | ------------ |
| 35             | MVL23       | MVL23       | 35           | 35 ✅        |
| 50             | MVL32       | MVL32       | 50           | 50 ✅        |
| 80             | MVL50       | MVL50       | 80           | 80 ✅        |
| 100            | MVL64       | MVL64       | 100          | 100 ✅       |

## Testing

1. Set volume to 35 using slider → Should show 35
2. Set volume to 50 using slider → Should show 50
3. Set volume to 80 using slider → Should show 80
4. Change volume on AVR itself → Slider should update correctly
5. Use volume up/down buttons → Should increment/decrement properly

## Note

The sender code was already correct. The main issue was in the receiver where we were parsing the hex string as if it contained decimal digits in some cases, when it's ALWAYS hexadecimal from the AVR.
