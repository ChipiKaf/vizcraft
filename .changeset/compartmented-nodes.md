---
"vizcraft": minor
---

Add compartmented node layout (UML-style multi-section nodes). Nodes can be divided into horizontal compartments separated by divider lines using the new `.compartment(id, cb?)` fluent API or the declarative `compartments` array in `NodeOptions`. Compartment heights are auto-sized from label content. Hit-testing returns `compartmentId` when clicking inside a specific section.
