import React, { type ReactNode } from 'react';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import CodeBlock from '@theme/CodeBlock';

interface CodePreviewProps {
  children: ReactNode;
  code: string;
}

export default function CodePreview({ children, code }: CodePreviewProps) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <Tabs
        children={[
          <TabItem
            value="preview"
            label="Preview"
            default
            children={
              <div
                style={{
                  border: '1px solid var(--ifm-color-emphasis-200)',
                  borderRadius: 'var(--ifm-global-radius)',
                  padding: '2rem',
                  backgroundColor: 'var(--ifm-background-surface-color)',
                }}
              >
                {children}
              </div>
            }
          />,
          <TabItem
            value="code"
            label="Code"
            children={<CodeBlock language="tsx" children={code} />}
          />,
        ]}
      />
    </div>
  );
}
