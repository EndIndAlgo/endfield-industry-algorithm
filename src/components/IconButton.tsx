import { Icon } from '@iconify/react';
import React from 'react';
import './IconButton.scss';
import classNames from 'classnames';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: string;
    tooltip?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({ icon, tooltip, className, ...props }) => {
    return (
        <button className={classNames('icon-button', className)} {...props}>
            <Icon icon={icon} className="icon-svg" width="100%" height="100%" />
            {tooltip && <span className="tooltip">{tooltip}</span>}
        </button>
    );
};
