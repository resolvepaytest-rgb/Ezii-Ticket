import styled from "styled-components";

type SwitchToggleProps = {
  checked: boolean;
  onChange: (nextChecked: boolean) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function SwitchToggle({ checked, onChange, disabled = false, className, ariaLabel }: SwitchToggleProps) {
  return (
    <StyledSwitch className={className}>
      <input
        type="checkbox"
        className="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="slider" />
    </StyledSwitch>
  );
}

const StyledSwitch = styled.label`
  display: inline-flex;
  cursor: pointer;

  .checkbox {
    display: none;
  }

  .slider {
    width: 60px;
    height: 30px;
    background-color: lightgray;
    border-radius: 20px;
    overflow: hidden;
    display: flex;
    align-items: center;
    border: 4px solid transparent;
    transition: 0.3s;
    box-shadow: inset 0 0 10px 0 rgb(0 0 0 / 0.25);
    cursor: pointer;
  }

  .slider::before {
    content: "";
    display: block;
    width: 100%;
    height: 100%;
    background-color: #fff;
    transform: translateX(-30px);
    border-radius: 20px;
    transition: 0.3s;
    box-shadow: 0 0 10px 3px rgb(0 0 0 / 0.25);
  }

  .checkbox:checked + .slider::before {
    transform: translateX(30px);
  }

  .checkbox:checked + .slider {
    background-color: #2196f3;
  }

  .checkbox:active + .slider::before {
    transform: translateX(0);
  }

  .checkbox:disabled + .slider {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .checkbox:disabled + .slider::before {
    box-shadow: 0 0 10px 1px rgb(0 0 0 / 0.15);
  }
`;
