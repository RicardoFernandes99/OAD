import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn.js'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger className={cn('select-trigger', className)} {...props}>
      {children}
      <SelectPrimitive.Icon className="select-chevron"><ChevronDown size={15} aria-hidden="true" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ className, children, position = 'popper', ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className={cn('select-content', className)} position={position} {...props}>
        <SelectPrimitive.Viewport className="select-viewport">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item className={cn('select-item', className)} {...props}>
      <span className="select-item-indicator"><SelectPrimitive.ItemIndicator><Check size={14} aria-hidden="true" /></SelectPrimitive.ItemIndicator></span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
