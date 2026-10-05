import { cn } from '../../lib/cn.js'

export function Badge({ variant = 'default', className, ...props }) {
  return <span className={cn('badge', `badge-${variant}`, className)} {...props} />
}
