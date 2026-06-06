import React, { useState } from 'react';
import ErrorTypeModal from './ErrorTypeModal';
import AceTargetModal from './AceTargetModal';
import ServeZoneOverlay from './ServeZoneOverlay';
import VoiceSubscriptionModal from './VoiceSubscriptionModal';

const ModalManager = ({ 
  children,
  courtPlayers,
  match,
  isMobile,
  deviceInfo,
  showHeader
}) => {
  const [showErrorTypeModal, setShowErrorTypeModal] = useState(false);
  const [showAceTargetModal, setShowAceTargetModal] = useState(false);
  const [showServeZoneOverlay, setShowServeZoneOverlay] = useState(false);
  const [showVoiceSubscriptionModal, setShowVoiceSubscriptionModal] = useState(false);
  const [pendingErrorCallback, setPendingErrorCallback] = useState(null);
  const [pendingAceCallback, setPendingAceCallback] = useState(null);
  const [selectedServeZone, setSelectedServeZone] = useState(null);

  const modalState = {
    showErrorTypeModal, setShowErrorTypeModal,
    showAceTargetModal, setShowAceTargetModal,
    showServeZoneOverlay, setShowServeZoneOverlay,
    showVoiceSubscriptionModal, setShowVoiceSubscriptionModal,
    pendingErrorCallback, setPendingErrorCallback,
    pendingAceCallback, setPendingAceCallback,
    selectedServeZone, setSelectedServeZone
  };

  return (
    <>
      {children(modalState)}
      
      {showErrorTypeModal && (
        <ErrorTypeModal
          isOpen={showErrorTypeModal}
          onClose={() => setShowErrorTypeModal(false)}
          onSelectError={pendingErrorCallback}
        />
      )}

      {showAceTargetModal && (
        <AceTargetModal
          isOpen={showAceTargetModal}
          courtPlayers={courtPlayers}
          onClose={() => setShowAceTargetModal(false)}
          onSelectTarget={pendingAceCallback}
        />
      )}

      {showServeZoneOverlay && (
        <ServeZoneOverlay
          isOpen={showServeZoneOverlay}
          server={courtPlayers[5]}
          onClose={() => setShowServeZoneOverlay(false)}
          onSelectZone={setSelectedServeZone}
          isMobile={isMobile}
          deviceInfo={deviceInfo}
          showHeader={showHeader}
        />
      )}

      {showVoiceSubscriptionModal && (
        <VoiceSubscriptionModal
          isOpen={showVoiceSubscriptionModal}
          onClose={() => setShowVoiceSubscriptionModal(false)}
        />
      )}
    </>
  );
};

export default ModalManager;
