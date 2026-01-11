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
      <Tabs>
        <TabItem value="preview" label="Preview" default>
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
        </TabItem>
        <TabItem value="code" label="Code">
          <CodeBlock language="tsx">{code}</CodeBlock>
        </TabItem>
      </Tabs>
    </div>
  );
}
