import { App as DemoApp } from './Reader.jsx';
import { DesktopApp } from './desktop/DesktopApp.jsx';
import { DesktopWidget } from './desktop/DesktopWidget.jsx';
export const App = window.paperWidget ? DesktopWidget : window.paperDesk ? DesktopApp : DemoApp;
