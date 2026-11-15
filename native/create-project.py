"""Generate the small, reproducible Xcode project without third-party tooling."""
from pathlib import Path
import plistlib
root=Path(__file__).parent
objects={}
def obj(key, isa, **values):
    ident=f'{key:024X}';objects[ident]={'isa':isa,**values};return ident
source_host=obj(1,'PBXFileReference',lastKnownFileType='sourcecode.swift',path='PaperWidgetHost.swift',sourceTree='<group>')
source_widget=obj(2,'PBXFileReference',lastKnownFileType='sourcecode.swift',path='ReadingWidget.swift',sourceTree='<group>')
source_resolver=obj(16,'PBXFileReference',lastKnownFileType='sourcecode.swift',path='MainAppResolver.swift',sourceTree='<group>')
product_host=obj(3,'PBXFileReference',explicitFileType='wrapper.application',path='文献伴读小组件.app',sourceTree='BUILT_PRODUCTS_DIR',includeInIndex=0)
product_widget=obj(4,'PBXFileReference',explicitFileType='wrapper.app-extension',path='PaperReadingExtension.appex',sourceTree='BUILT_PRODUCTS_DIR',includeInIndex=0)
info_host=obj(5,'PBXFileReference',lastKnownFileType='text.plist.xml',path='Host-Info.plist',sourceTree='<group>')
info_widget=obj(6,'PBXFileReference',lastKnownFileType='text.plist.xml',path='Widget-Info.plist',sourceTree='<group>')
entitlements=obj(7,'PBXFileReference',lastKnownFileType='text.plist.entitlements',path='Widget.entitlements',sourceTree='<group>')
products=obj(8,'PBXGroup',children=[product_host,product_widget],name='Products',sourceTree='<group>')
main_group=obj(9,'PBXGroup',children=[source_host,source_resolver,source_widget,info_host,info_widget,entitlements,products],sourceTree='<group>')
build_host=obj(10,'PBXBuildFile',fileRef=source_host)
build_widget=obj(11,'PBXBuildFile',fileRef=source_widget)
build_resolver=obj(17,'PBXBuildFile',fileRef=source_resolver)
build_embed=obj(12,'PBXBuildFile',fileRef=product_widget,settings={'ATTRIBUTES':['RemoveHeadersOnCopy','CodeSignOnCopy']})
host_sources=obj(13,'PBXSourcesBuildPhase',buildActionMask=2147483647,files=[build_host,build_resolver],runOnlyForDeploymentPostprocessing=0)
widget_sources=obj(14,'PBXSourcesBuildPhase',buildActionMask=2147483647,files=[build_widget],runOnlyForDeploymentPostprocessing=0)
embed=obj(15,'PBXCopyFilesBuildPhase',buildActionMask=2147483647,dstPath='',dstSubfolderSpec=13,files=[build_embed],name='Embed App Extensions',runOnlyForDeploymentPostprocessing=0)
common={'MACOSX_DEPLOYMENT_TARGET':'14.0','SDKROOT':'macosx','SWIFT_VERSION':'5.0','CODE_SIGN_STYLE':'Manual','CODE_SIGN_IDENTITY':'-','SWIFT_OPTIMIZATION_LEVEL':'-O','CLANG_ENABLE_MODULES':'YES','PAPER_SNAPSHOT_DIRECTORY':'$(HOME)/Library/Application Support/文献伴读/Library/widget-snapshot','MARKETING_VERSION':'0.2.15','CURRENT_PROJECT_VERSION':'15','ONLY_ACTIVE_ARCH':'YES'}
def configs(key, values):
    refs=[]
    for i,name in enumerate(['Debug','Release']):
        refs.append(obj(key+i,'XCBuildConfiguration',buildSettings=values,name=name))
    return obj(key+2,'XCConfigurationList',buildConfigurations=refs,defaultConfigurationIsVisible=0,defaultConfigurationName='Release')
project_configs=configs(20,common)
host_configs=configs(30,{'PRODUCT_NAME':'文献伴读小组件','EXECUTABLE_NAME':'PaperWidgetHost','PRODUCT_BUNDLE_IDENTIFIER':'com.mw.papercompanion.widgets','INFOPLIST_FILE':'Host-Info.plist','GENERATE_INFOPLIST_FILE':'NO','LD_RUNPATH_SEARCH_PATHS':['$(inherited)','@executable_path/../Frameworks']})
widget_configs=configs(40,{'PRODUCT_NAME':'PaperReadingExtension','PRODUCT_BUNDLE_IDENTIFIER':'com.mw.papercompanion.widgets.reading','INFOPLIST_FILE':'Widget-Info.plist','GENERATE_INFOPLIST_FILE':'NO','CODE_SIGN_ENTITLEMENTS':'Widget.entitlements','APPLICATION_EXTENSION_API_ONLY':'YES','SKIP_INSTALL':'YES','OTHER_LDFLAGS':['$(inherited)','-e','_NSExtensionMain'],'LD_RUNPATH_SEARCH_PATHS':['$(inherited)','@executable_path/../Frameworks','@executable_path/../../../../Frameworks']})
project_id=f'{100:024X}';widget_id=f'{60:024X}'
proxy=obj(50,'PBXContainerItemProxy',containerPortal=project_id,proxyType=1,remoteGlobalIDString=widget_id,remoteInfo='PaperReadingExtension')
dependency=obj(51,'PBXTargetDependency',target=widget_id,targetProxy=proxy)
widget_target=obj(60,'PBXNativeTarget',buildConfigurationList=widget_configs,buildPhases=[widget_sources],buildRules=[],dependencies=[],name='PaperReadingExtension',productName='PaperReadingExtension',productReference=product_widget,productType='com.apple.product-type.app-extension')
host_target=obj(61,'PBXNativeTarget',buildConfigurationList=host_configs,buildPhases=[host_sources,embed],buildRules=[],dependencies=[dependency],name='PaperWidgetHost',productName='文献伴读小组件',productReference=product_host,productType='com.apple.product-type.application')
obj(100,'PBXProject',attributes={'LastUpgradeCheck':'2700'},buildConfigurationList=project_configs,compatibilityVersion='Xcode 14.0',developmentRegion='zh-Hans',hasScannedForEncodings=0,knownRegions=['zh-Hans','en','Base'],mainGroup=main_group,productRefGroup=products,projectDirPath='',projectRoot='',targets=[host_target,widget_target])
(root/'PaperWidgets.xcodeproj/project.pbxproj').write_bytes(plistlib.dumps({'archiveVersion':'1','classes':{},'objectVersion':'56','objects':objects,'rootObject':project_id},sort_keys=False))
base={'CFBundleDevelopmentRegion':'zh-Hans','CFBundleExecutable':'$(EXECUTABLE_NAME)','CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleInfoDictionaryVersion':'6.0','CFBundleShortVersionString':'$(MARKETING_VERSION)','CFBundleVersion':'$(CURRENT_PROJECT_VERSION)','LSMinimumSystemVersion':'$(MACOSX_DEPLOYMENT_TARGET)'}
(root/'Host-Info.plist').write_bytes(plistlib.dumps({**base,'CFBundleName':'文献伴读','CFBundleDisplayName':'文献伴读','CFBundlePackageType':'APPL','LSUIElement':True,'NSHighResolutionCapable':True,'CFBundleURLTypes':[{'CFBundleURLName':'文献伴读系统组件','CFBundleURLSchemes':['papercompanion-widget']}]}))
(root/'Widget-Info.plist').write_bytes(plistlib.dumps({**base,'CFBundleName':'文献伴读','CFBundleDisplayName':'文献伴读','CFBundlePackageType':'XPC!','CFBundleSupportedPlatforms':['MacOSX'],'NSExtension':{'NSExtensionPointIdentifier':'com.apple.widgetkit-extension'},'PaperWidgetSnapshot':'$(PAPER_SNAPSHOT_DIRECTORY)/dashboard.json'}))
(root/'Widget.entitlements').write_bytes(plistlib.dumps({'com.apple.security.app-sandbox':True,'com.apple.security.temporary-exception.files.absolute-path.read-only':['$(PAPER_SNAPSHOT_DIRECTORY)/']}))
scheme=root/'PaperWidgets.xcodeproj/xcshareddata/xcschemes/PaperWidgetHost.xcscheme';scheme.parent.mkdir(parents=True,exist_ok=True)
scheme.write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2700" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{host_target}" BuildableName="文献伴读小组件.app" BlueprintName="PaperWidgetHost" ReferencedContainer="container:PaperWidgets.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{host_target}" BuildableName="文献伴读小组件.app" BlueprintName="PaperWidgetHost" ReferencedContainer="container:PaperWidgets.xcodeproj"/></BuildableProductRunnable></LaunchAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>''')
print(root/'PaperWidgets.xcodeproj')
