import { useNavigate } from "react-router-dom";
import { Button, Icon } from "@chakra-ui/react";
import { FaVideo } from "react-icons/fa";

const CallButton = ({ callId, role = 'paramedico' }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    const room = callId || `EC-${Date.now()}`;
    navigate(`/videocall?room=${room}&role=${role}`);
  };

  return (
    <Button
      w="100%"
      h="60px"
      bg="#0ea5e9"
      color="white"
      fontSize="16px"
      fontWeight="900"
      letterSpacing="1px"
      borderRadius="xl"
      leftIcon={<Icon as={FaVideo} boxSize={5} />}
      _hover={{ bg: '#0284c7' }}
      onClick={handleClick}
    >
      SOLICITAR MÉDICO
    </Button>
  );
};

export default CallButton;