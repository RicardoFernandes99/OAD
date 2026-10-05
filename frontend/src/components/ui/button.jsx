import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn.js'

const buttonStyles = cva('button', {
  variants: {
    variant: {
      default: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      outline: 'button-outline',
    },
    size: {
      default: 'button-md',
      sm: 'button-sm',
      icon: 'button-icon',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export function Button({ className, variant, size, type = 'button', ...props }) {
  return <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...props} />
}
