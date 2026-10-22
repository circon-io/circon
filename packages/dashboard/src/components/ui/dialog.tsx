'use client'

import { Modal } from '@heroui/react'

/**
 * A modal dialog with the dashboard's header layout. HeroUI handles focus
 * trapping, Escape and the backdrop; this only fixes the arrangement.
 */
export function Dialog({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <Modal>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container size={size}>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header className="flex flex-col items-start gap-1">
              <Modal.Heading className="text-base font-semibold">{title}</Modal.Heading>
              {description && <p className="text-sm text-muted">{description}</p>}
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">{children}</Modal.Body>
            {footer && <Modal.Footer className="flex justify-end gap-2">{footer}</Modal.Footer>}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
