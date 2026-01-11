import React from 'react';
import './StepIndicator.scss';

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  onNextStep: () => void;
  onReset: () => void;
  passCount?: number;
  isProcessing?: boolean;
  nextButtonConfig?: {
    text?: string;
    processingText?: string;
    color?: string;
  };
  restartButtonConfig?: {
    text?: string;
    color?: string;
  };
}

const StepIndicator: React.FC<StepIndicatorProps> = ({
  steps,
  currentStep,
  onNextStep,
  onReset,
  passCount = 1,
  isProcessing = false,
  nextButtonConfig,
  restartButtonConfig,
}) => {
  const isFinished = currentStep >= steps.length;

  return (
    <div className="step-indicator">
      <h2>
        Process Flow{' '}
        <span style={{ fontSize: '0.8em', opacity: 0.6, marginLeft: '10px' }}>
          Pass {passCount}
        </span>
      </h2>

      <div className="step-list">
        {steps.map((step, index) => {
          let status = 'pending';
          if (index < currentStep) status = 'completed';
          if (index === currentStep) status = 'active';

          return (
            <div key={index} className={`step-item ${status}`}>
              <div className="step-marker">
                <div className="step-circle">
                  {status === 'completed' ? '✓' : index + 1}
                </div>
                {index < steps.length - 1 && <div className="step-line" />}
              </div>
              <div className="step-content">
                <div className="step-label">{step}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="controls">
        {isFinished ? (
          <button
            onClick={onReset}
            style={{ background: restartButtonConfig?.color || '#4f46e5' }}
          >
            {restartButtonConfig?.text || 'Start Next Pass'}
          </button>
        ) : (
          <button
            onClick={onNextStep}
            disabled={isProcessing}
            style={{
              ...(isProcessing ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
              ...(nextButtonConfig?.color
                ? { background: nextButtonConfig.color }
                : {}),
            }}
          >
            {isProcessing
              ? nextButtonConfig?.processingText || 'Processing...'
              : nextButtonConfig?.text || 'Next Step'}
          </button>
        )}
      </div>
    </div>
  );
};

export default StepIndicator;
