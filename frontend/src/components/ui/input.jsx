import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from 'cn'
import { FIELD_LOOK } from './field-classes.js'

// A flat field: 1px outline in the ink colour, on the card colour (#528).
function Input({ className, type, ...props }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(FIELD_LOOK, className)}
      {...props}
    />
  )
}

export { Input }
