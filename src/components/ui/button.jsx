import {Slot} from '@radix-ui/react-slot';
import {cva} from 'class-variance-authority';
import {cn} from '@/lib/utils';
const variants=cva('erp-button',{variants:{variant:{default:'button-primary',outline:'button-outline',ghost:'button-ghost',danger:'button-danger',success:'button-success',warning:'button-warning',violet:'button-violet'},size:{default:'button-md',sm:'button-sm',icon:'button-icon'}},defaultVariants:{variant:'default',size:'default'}});
export function Button({className,variant,size,asChild=false,type='button',...props}){const Comp=asChild?Slot:'button';return <Comp {...(!asChild?{type}:{})} className={cn(variants({variant,size}),className)} {...props}/>}
